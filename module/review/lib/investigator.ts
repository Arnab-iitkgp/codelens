import prisma from "@/lib/db";
import parseDiff from "parse-diff";
import { retrieveContextForDiff, RetrievedChunk } from "@/module/ai/lib/rag";

export type InvestigatedChunk = RetrievedChunk & { type: "graph" | "vector" };

export async function gatherReviewContext(
  repoFullName: string,
  diffText: string
): Promise<InvestigatedChunk[]> {
  const contextChunks: InvestigatedChunk[] = [];
  
  // Resolve the database CUID for the Postgres graph tables
  const [owner, name] = repoFullName.split("/");
  let dbRepoId = repoFullName; // Fallback for eval/test
  if (owner && name) {
    const repository = await prisma.repository.findFirst({ where: { owner, name } });
    if (repository) {
      dbRepoId = repository.id;
    }
  }

  const parsed = parseDiff(diffText);
  
  // 1. Deterministic Graph Traversal
  for (const file of parsed) {
    if (!file.to) continue; // Deleted file

    for (const chunk of file.chunks) {
      const changedLines = chunk.changes
        .map((c: parseDiff.Change) => c.type === "add" ? c.ln : (c.type === "normal" ? c.ln2 : null))
        .filter(Boolean) as number[];
      
      if (changedLines.length === 0) continue;
      
      const fileSymbols = await prisma.symbol.findMany({
        where: { repositoryId: dbRepoId, path: file.to }
      });
      
      const matchedSymbols = fileSymbols.filter(sym => 
        changedLines.some(line => line >= sym.startLine && line <= sym.endLine)
      );

      const uniqueSymbols = Array.from(new Set(matchedSymbols));

      for (const sym of uniqueSymbols) {
        const callers = await prisma.edge.findMany({
          where: { repositoryId: dbRepoId, targetSymbolId: sym.id },
          include: { sourceSymbol: true }
        });
        
        const callees = await prisma.edge.findMany({
          where: { repositoryId: dbRepoId, sourceSymbolId: sym.id },
          include: { targetSymbol: true }
        });
        
        let content = `[GRAPH NODE] ${sym.qualifiedName}\nPath: ${sym.path}\n\`\`\`\n${sym.codeBody}\n\`\`\`\n`;
        
        if (callers.length > 0) {
          content += `\n[CALLERS (Dependencies who use this)]:\n`;
          content += callers.map(c => `- ${c.sourceSymbol.qualifiedName} (${c.sourceSymbol.path}) [${c.provenance}]`).join("\n");
        }
        
        if (callees.length > 0) {
          content += `\n[CALLEES (Things this node uses)]:\n`;
          content += callees.map(c => `- ${c.targetSymbol.qualifiedName} (${c.targetSymbol.path}) [${c.provenance}]`).join("\n");
        }

        contextChunks.push({
          path: sym.path,
          content,
          score: 1.0, 
          type: "graph"
        });
      }
    }
  }

  // 2. Vector Retrieval (Always fetch, but merge via budget)
  // Pinecone uses the raw 'owner/repo' string namespace, not the CUID
  const vectorChunks: InvestigatedChunk[] = [];
  const fallbackChunks = await retrieveContextForDiff(diffText, repoFullName);
  for (const fallback of fallbackChunks) {
    vectorChunks.push({
      path: fallback.path,
      content: `[VECTOR MATCH]\n${fallback.content}`,
      score: fallback.score,
      type: "vector"
    });
  }

  // 3. Hybrid Merge & Token Budget Enforcer
  // To prevent LLM context limits (e.g. Groq 8k), we strictly budget the context payload.
  const MAX_CONTEXT_CHARS = 6000;
  let currentChars = 0;
  const finalChunks: InvestigatedChunk[] = [];
  const seenContent = new Set<string>();

  const tryAddChunk = (chunk: InvestigatedChunk) => {
    if (seenContent.has(chunk.content)) return true; // Already added, skip
    // If adding this exceeds the budget (and we already have at least 1 chunk), stop
    if (currentChars + chunk.content.length > MAX_CONTEXT_CHARS && currentChars > 0) {
      return false; 
    }
    finalChunks.push(chunk);
    seenContent.add(chunk.content);
    currentChars += chunk.content.length;
    return true;
  };

  // Priority 1: Graph Traversal (Highest Signal)
  for (const chunk of contextChunks) {
    if (!tryAddChunk(chunk)) break;
  }

  // Priority 2: Vector Fallback (Semantic Match)
  // Sort vector chunks by score descending to get best semantic matches first
  vectorChunks.sort((a, b) => b.score - a.score);
  for (const chunk of vectorChunks) {
    if (!tryAddChunk(chunk)) break;
  }

  return finalChunks;
}
