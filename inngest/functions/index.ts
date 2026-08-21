import prisma from "@/lib/db";
import { inngest } from "../client";
import { getRepoFileContents } from "@/module/github/lib/github";
import { indexCodebase, indexGraphSymbols } from "@/module/ai/lib/rag";
import { getParser, tsLanguage } from "@/module/ast/lib/parser";
import { typescriptAdapter } from "@/module/ast/lib/adapters/typescript";
import { pythonAdapter } from "@/module/ast/lib/adapters/python";
import { resolveGraphEdges } from "@/module/ast/lib/resolver";

const ADAPTERS = [typescriptAdapter, pythonAdapter];

export const indexRepo  = inngest.createFunction(
  {id:"index-repo", triggers: [{event:"repository.connected"}]},
  async({event,step})=>{
      const {owner,repo,userId} = event.data;
      
      const dbRepo = await step.run("fetch-repo-metadata", async () => {
        const repository = await prisma.repository.findFirst({
          where: { owner, name: repo }
        });
        if (!repository) throw new Error("Repository not found in DB");
        return repository;
      });

      //fetch files
      const files = await step.run("fetch-files",async()=>{
        const account = await prisma.account.findFirst({
          where:{
            userId:userId,
            providerId:"github"
          }
        })
        if(!account?.accessToken){
          throw new Error("No Github access token found")
        }

        const startFetch = Date.now();
        const result = await getRepoFileContents(account.accessToken,owner,repo);
        console.log(`[INDEXING] Fetched ${result.length} files in ${Date.now() - startFetch}ms`);
        return result;
      });

      // Hybrid splitting (Phase 3D)
      const getAdapter = (filename: string) => ADAPTERS.find(a => a.extensions.some(ext => filename.endsWith(ext)));
      const graphFiles = files.filter(f => !!getAdapter(f.path));
      const textFiles = files.filter(f => !getAdapter(f.path));

      await step.run("build-ast-graph", async () => {
        if (graphFiles.length === 0) return;
        const startGraph = Date.now();
        
        // Clean existing graph data for this repo
        await prisma.edge.deleteMany({ where: { repositoryId: dbRepo.id } });
        await prisma.symbol.deleteMany({ where: { repositoryId: dbRepo.id } });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const repoFacts: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newSymbols: any[] = [];

        for (const file of graphFiles) {
          try {
            const adapter = getAdapter(file.path)!;
            const { parser, language } = await getParser(adapter.getWasmFileName());
            
            const tree = parser.parse(file.content);
            if (!tree) {
              console.warn(`[INDEXING] Failed to parse AST for ${file.path}`);
              continue;
            }
            const symbols = adapter.extractSymbols(tree, language, file.content, file.path);
            const imports = adapter.extractImports(tree, language, file.content, file.path);
            const calls = adapter.extractCalls(tree, language, file.content, file.path);
            
            repoFacts.push({ path: file.path, symbols, imports, calls });

            for (const sym of symbols) {
              newSymbols.push({
                repositoryId: dbRepo.id,
                path: file.path,
                name: sym.name,
                qualifiedName: sym.qualifiedName,
                kind: sym.kind,
                language: adapter.language,
                startLine: sym.startLine,
                endLine: sym.endLine,
                signature: sym.signature || null,
                codeBody: sym.codeBody,
                isTest: sym.isTest || false,
                isExported: sym.isExported || false,
              });
            }
          } catch (e) {
            console.error(`Failed to parse graph for ${file.path}`, e);
          }
        }

        // Batch insert symbols
        if (newSymbols.length > 0) {
          await prisma.symbol.createMany({ data: newSymbols, skipDuplicates: true });
        }

        // Fetch back symbols to map IDs for edges
        let savedSymbols = await prisma.symbol.findMany({ where: { repositoryId: dbRepo.id } });
        const symbolIdMap = new Map<string, string>();
        for (const s of savedSymbols) {
          symbolIdMap.set(`${s.path}:${s.qualifiedName}`, s.id);
        }

        // Resolve edges
        const resolvedEdges = resolveGraphEdges(repoFacts);
        
        // Find and create dummy nodes for unresolved/external targets
        const missingTargets = new Map<string, {path: string, qualifiedName: string}>();
        for (const edge of resolvedEdges) {
          const targetKey = `${edge.targetSymbolPath}:${edge.targetSymbolQualifiedName}`;
          if (!symbolIdMap.has(targetKey)) {
            missingTargets.set(targetKey, { path: edge.targetSymbolPath, qualifiedName: edge.targetSymbolQualifiedName });
          }
        }

        if (missingTargets.size > 0) {
          const missingArr = Array.from(missingTargets.values()).map(t => ({
            repositoryId: dbRepo.id,
            path: t.path,
            name: t.qualifiedName.split('.').pop() || t.qualifiedName,
            qualifiedName: t.qualifiedName,
            kind: "external/unknown",
            language: "unknown",
            startLine: 0,
            endLine: 0,
            codeBody: ""
          }));
          await prisma.symbol.createMany({ data: missingArr, skipDuplicates: true });
          // Re-fetch to update map with the newly created dummy nodes
          savedSymbols = await prisma.symbol.findMany({ where: { repositoryId: dbRepo.id } });
          for (const s of savedSymbols) {
            symbolIdMap.set(`${s.path}:${s.qualifiedName}`, s.id);
          }
        }

        // Now map all edges
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newEdges: any[] = [];
        for (const edge of resolvedEdges) {
          const sourceId = symbolIdMap.get(`${edge.sourceSymbolPath}:${edge.sourceSymbolQualifiedName}`);
          const targetId = symbolIdMap.get(`${edge.targetSymbolPath}:${edge.targetSymbolQualifiedName}`);

          if (!sourceId || !targetId) continue; // Should rarely happen now

          newEdges.push({
            repositoryId: dbRepo.id,
            sourceSymbolId: sourceId,
            targetSymbolId: targetId,
            kind: edge.kind,
            provenance: edge.provenance,
            weight: edge.weight,
            sourceFile: edge.sourceSymbolPath,
            sourceLine: edge.sourceLine
          });
        }

        if (newEdges.length > 0) {
          await prisma.edge.createMany({ data: newEdges, skipDuplicates: true });
        }

        console.log(`[INDEXING] Graph built with ${newSymbols.length} symbols, ${newEdges.length} edges in ${Date.now() - startGraph}ms`);

        // Phase 3D.3 - Embed all real symbols (skip external/unknown dummies)
        const realSymbols = savedSymbols.filter(s => s.kind !== "external/unknown");
        if (realSymbols.length > 0) {
          const startEmbed = Date.now();
          await indexGraphSymbols(dbRepo.id, realSymbols);
          console.log(`[INDEXING] Graph symbols embedded in ${Date.now() - startEmbed}ms`);
        }
      });

      await step.run("index-codebase",async ()=>{
        if (textFiles.length === 0) return;
        const startIndex = Date.now();
        await indexCodebase(`${owner}/${repo}`,textFiles);
        console.log(`[INDEXING] Embedded ${textFiles.length} text files in ${Date.now() - startIndex}ms`);
      });

      // Store indexed file count on the repository
      await step.run("update-repo-metadata", async () => {
        await prisma.repository.updateMany({
          where: { owner, name: repo },
          data: { 
            indexedFileCount: files.length,
            graphBuiltAt: new Date()
          },
        });
      });

      return{success:true,indexedFiles:files.length }
  }
);
