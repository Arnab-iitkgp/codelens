import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createVertex } from '@ai-sdk/google-vertex';
import { getLanguageModel, getNextGoogleProvider } from './models';
import { Octokit } from 'octokit';
import { retrieveContext } from './rag';
import prisma from '@/lib/db';

function getAgentModel() {
  // Agents require deep reasoning (AST graph traversal, Pinecone validation).
  // We default to the Pro tier if no env var is provided, as Flash struggles with strict output formats.
  const agentModelId = process.env.AI_AGENT_MODEL_ID || "gemini-3.1-pro-preview";
  console.log(`[Agent] Booting agent using model: ${agentModelId} (GCP_ENABLED=${process.env.GCP_ENABLED || "false"})`);
  
  // The Agent strictly uses Google/Vertex models, bypassing the primary AI_PROVIDER (which is Groq for reviews)
  const provider = getNextGoogleProvider(false);
  return { model: provider(agentModelId), modelId: agentModelId };
}

/**
 * Pre-gathers deterministic graph context for the agent (D-011: deterministic-first).
 * Queries the Postgres AST graph for the symbols in the target file,
 * then fetches callers (blast radius) and callees (dependencies) so the agent
 * starts with structural awareness instead of blindly searching.
 */
async function gatherGraphContext(repoId: string, filePath: string): Promise<string> {
  try {
    // Find all symbols in the target file
    const symbols = await prisma.symbol.findMany({
      where: { repositoryId: repoId, path: filePath }
    });

    if (symbols.length === 0) {
      return "[Graph] No symbols indexed for this file. Use read_file and semantic_search to investigate.";
    }

    const sections: string[] = [];
    sections.push(`[Graph] Found ${symbols.length} symbol(s) in ${filePath}:`);

    // For each symbol, get its callers and callees (cap at 8 symbols to keep context tight)
    for (const sym of symbols.slice(0, 8)) {
      let section = `\n### ${sym.kind}: ${sym.qualifiedName} (L${sym.startLine}-${sym.endLine})`;
      if (sym.isExported) section += " [exported]";
      if (sym.isTest) section += " [test]";

      const callers = await prisma.edge.findMany({
        where: { repositoryId: repoId, targetSymbolId: sym.id },
        include: { sourceSymbol: true },
        take: 5
      });

      const callees = await prisma.edge.findMany({
        where: { repositoryId: repoId, sourceSymbolId: sym.id },
        include: { targetSymbol: true },
        take: 5
      });

      if (callers.length > 0) {
        section += `\n  CALLERS (blast radius — these break if you change this symbol):`;
        section += callers.map(c => `\n    - ${c.sourceSymbol.qualifiedName} in ${c.sourceSymbol.path} [${c.provenance}]`).join("");
      }

      if (callees.length > 0) {
        section += `\n  CALLEES (dependencies this symbol uses):`;
        section += callees.map(c => `\n    - ${c.targetSymbol.qualifiedName} in ${c.targetSymbol.path} [${c.provenance}]`).join("");
      }

      if (callers.length === 0 && callees.length === 0) {
        section += "\n  No graph edges. This symbol is isolated (safe to modify).";
      }

      sections.push(section);
    }

    return sections.join("\n");
  } catch (error: any) {
    console.error(`[Agent] Graph pre-gather failed: ${error.message}`);
    return "[Graph] Graph lookup failed. Use read_file and semantic_search to investigate manually.";
  }
}

/**
 * Runs a true ReAct (Reasoning + Acting) Agent loop to auto-fix a bug using Graph-Augmentation.
 * 
 * Architecture (D-011): Deterministic graph traversal runs FIRST (zero LLM cost),
 * then the ReAct loop lets the LLM reason on top of that structured evidence.
 */
export async function runAgenticFixer(
  githubToken: string,
  owner: string,
  repo: string,
  repoId: string, // for database lookups
  bugFinding: string, // the JSON string of the finding
  initialFilePath: string
) {
  const { model, modelId } = getAgentModel();
  const octokit = new Octokit({ auth: githubToken });

  console.log(`[Agent] Starting ReAct loop for bug in ${initialFilePath}`);

  let finalPatch = "";
  let finalPlan = "";
  let accumulatedThoughts = "";

  // ── Phase 1: Deterministic Context Gathering (zero LLM cost) ──
  console.log(`[Agent] Phase 1: Gathering graph context from Postgres...`);
  const graphContext = await gatherGraphContext(repoId, initialFilePath);
  console.log(`[Agent] Graph context: ${graphContext.length} chars`);

  // ── Phase 2: ReAct Agent Loop (LLM-driven) ──
  const tools = {
    read_file: tool({
      description: 'Read the raw contents of any file from the GitHub repository. Provide "path" (string, e.g. "src/utils.ts").',
      parameters: z.object({ path: z.string() }),
      // @ts-ignore: Type inference fails due to zod version mismatch
      execute: async ({ path }) => {
        try {
          console.log(`[Agent] Tool: read_file -> ${path}`);
          const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
          if (Array.isArray(data) || !('content' in data)) return "Error: Path is a directory, not a file.";
          return Buffer.from(data.content, "base64").toString("utf-8");
        } catch (error: any) {
          return `Error reading file: ${error.message}`;
        }
      },
    }) as any,
    query_ast_callers: tool({
      description: 'Find other files that call a specific function to prevent breaking dependent code. Provide "symbolName" (string).',
      parameters: z.object({ symbolName: z.string() }),
      // @ts-ignore: Type inference fails due to zod version mismatch
      execute: async ({ symbolName }) => {
        try {
          console.log(`[Agent] Tool: query_ast_callers -> ${symbolName}`);
          const symbols = await prisma.symbol.findMany({ where: { repositoryId: repoId, qualifiedName: { contains: symbolName } }, take: 5 });
          if (symbols.length === 0) return "Symbol not found in AST graph.";
          const callers = await prisma.edge.findMany({ where: { targetSymbolId: { in: symbols.map(s => s.id) }, kind: 'CALLS' }, include: { sourceSymbol: true } });
          if (callers.length === 0) return "No callers found. It is safe to modify.";
          return JSON.stringify(callers.map(c => ({ caller: c.sourceSymbol.qualifiedName, file: c.sourceSymbol.path })));
        } catch (error: any) {
          return `Error querying graph: ${error.message}`;
        }
      },
    }) as any,
    semantic_search: tool({
      description: 'Search the Pinecone vector database for code related to an abstract concept. Provide "query" (string). Use this ONLY if the graph context above is insufficient.',
      parameters: z.object({ query: z.string() }),
      // @ts-ignore: Type inference fails due to zod version mismatch
      execute: async ({ query }) => {
        try {
          console.log(`[Agent] Tool: semantic_search -> "${query}"`);
          const contexts = await retrieveContext(query, repoId, 3);
          if (!contexts || contexts.length === 0) return "No related code found.";
          return contexts.join("\n\n---\n\n");
        } catch (error: any) {
          return `Error in semantic search: ${error.message}`;
        }
      },
    }) as any,
    write_plan: tool({
      description: 'Record your root cause analysis and step-by-step plan before writing code. Provide "analysis" (string) and "plan" (string).',
      parameters: z.object({ analysis: z.string(), plan: z.string() }),
      // @ts-ignore: Type inference fails due to zod version mismatch
      execute: async ({ analysis, plan }) => {
        console.log(`[Agent] Tool: write_plan recorded.`);
        finalPlan = `**Analysis:**\n${analysis}\n\n**Plan:**\n${plan}`;
        return "Plan saved successfully. You MUST now use propose_patch to submit the final code.";
      },
    }) as any,
    propose_patch: tool({
      description: 'Submit the final fixed snippet. Provide "path" (string, file path) and "fixedSnippet" (string, the exact replacement code — only the changed lines, not the full file).',
      parameters: z.object({
        path: z.string(),
        fixedSnippet: z.string(),
      }),
      // @ts-ignore: Type inference fails due to zod version mismatch
      execute: async ({ path, fixedSnippet }) => {
        console.log(`[Agent] Tool: propose_patch -> ${path}`);
        finalPatch = fixedSnippet;
        return "Patch saved. You have completed your task.";
      },
    }) as any,
  };

  const systemPrompt = `You are an autonomous Senior Engineering Agent. 
Your goal is to fix the following bug in the repository ${owner}/${repo}:
"${bugFinding}"

The bug is located in file: ${initialFilePath}

=== CODE GRAPH CONTEXT (pre-gathered from Postgres AST — advisory, not ground truth) ===
${graphContext}

IMPORTANT — how to interpret this graph:
- [EXTRACTED] edges are PROVEN (derived from explicit imports). Treat as facts.
- [RESOLVED] edges are HIGH-CONFIDENCE (cross-file heuristics). Treat as likely true.
- [INFERRED] edges are GUESSES (e.g. from this.service.method() patterns). Treat as hints only.
- This graph reflects the repo state AT INDEX TIME. The PR may have already modified some callers.
- Always verify callers by reading the actual files before assuming a dependency is real.
======================================================================================

You have access to these tools: read_file, query_ast_callers, semantic_search, write_plan, propose_patch.

You MUST follow the ReAct loop:
1. OBSERVE: Use 'read_file' to read ${initialFilePath}. The file is the ground truth — the graph is just orientation.
2. INVESTIGATE: If the graph shows EXTRACTED callers, use 'query_ast_callers' to verify they still exist. Only use 'semantic_search' if the graph is empty or you need abstract concept lookup.
3. PLAN: Use 'write_plan' to record your root cause analysis and step-by-step fix.
4. ACT: Use 'propose_patch' to output the corrected code snippet. Do not guess syntax.

IMPORTANT: Do NOT spend more than 2 steps on semantic_search. The graph and read_file are your primary tools.`;

  let messages: any[] = [
    {
      role: 'user',
      content: "Begin your investigation and fix."
    }
  ];

  const MAX_STEPS = 10;

  for (let step = 0; step < MAX_STEPS; step++) {
    const remaining = MAX_STEPS - step;

    // Inject step-budget awareness so the agent self-regulates
    if (step > 0) {
      let nudge = `[System: Step ${step + 1}/${MAX_STEPS} — ${remaining} steps remaining.]`;
      if (remaining <= 3 && finalPlan === "") {
        nudge += ` ⚠️ You are running low on steps. You MUST call 'write_plan' now and then 'propose_patch' immediately.`;
      } else if (remaining <= 2) {
        nudge += ` 🚨 FINAL WARNING: Call 'propose_patch' NOW or you will fail the task.`;
      }
      messages.push({ role: 'user', content: nudge });
    }

    // @ts-ignore
    const result = await generateText({ model, system: systemPrompt, messages, tools });
    
    if (result.text) {
      accumulatedThoughts += result.text + "\n";
    }

    // Append assistant's response and tool results to history
    if (result.response && result.response.messages) {
      messages = messages.concat(result.response.messages);
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      break; // No more tool calls, agent is done
    }

    if (finalPatch !== "") {
      break; // We got the patch, exit early
    }
  }

  return {
    success: finalPatch !== "",
    plan: finalPlan,
    patch: finalPatch,
    agentThoughts: accumulatedThoughts,
    modelUsed: modelId
  };
}
