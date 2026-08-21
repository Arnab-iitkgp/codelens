import prisma from "@/lib/db";
// @ts-ignore
import parseDiff from "parse-diff";
import { retrieveContextForDiff, RetrievedChunk } from "@/module/ai/lib/rag";

export type InvestigatedChunk = RetrievedChunk & { type: "graph" | "vector" };

export async function gatherReviewContext(
  repoId: string,
  diffText: string
): Promise<InvestigatedChunk[]> {
  const contextChunks: InvestigatedChunk[] = [];
  const parsed = parseDiff(diffText);
  
  // 1. Deterministic Graph Traversal
  for (const file of parsed) {
    if (!file.to) continue; // Deleted file

    for (const chunk of file.chunks) {
      const changedLines = chunk.changes
        .map((c: any) => c.type === "add" ? c.ln : (c.type === "normal" ? c.ln2 : null))
        .filter(Boolean) as number[];
      
      if (changedLines.length === 0) continue;
      
      const fileSymbols = await prisma.symbol.findMany({
        where: { repositoryId: repoId, path: file.to }
      });
      
      const matchedSymbols = fileSymbols.filter(sym => 
        changedLines.some(line => line >= sym.startLine && line <= sym.endLine)
      );

      const uniqueSymbols = Array.from(new Set(matchedSymbols));

      for (const sym of uniqueSymbols) {
        const callers = await prisma.edge.findMany({
          where: { repositoryId: repoId, targetSymbolId: sym.id },
          include: { sourceSymbol: true }
        });
        
        const callees = await prisma.edge.findMany({
          where: { repositoryId: repoId, sourceSymbolId: sym.id },
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

  // 2. Vector Fallback
  const fallbackChunks = await retrieveContextForDiff(diffText, repoId);
  for (const fallback of fallbackChunks) {
    contextChunks.push({
      path: fallback.path,
      content: `[VECTOR MATCH]\n${fallback.content}`,
      score: fallback.score,
      type: "vector"
    });
  }

  // Deduplicate and cap
  const uniqueChunks = new Map<string, InvestigatedChunk>();
  for (const chunk of contextChunks) {
    uniqueChunks.set(chunk.content, chunk);
  }

  return Array.from(uniqueChunks.values()).sort((a, b) => b.score - a.score).slice(0, 15);
}
