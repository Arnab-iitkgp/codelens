import { generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { getAgentChain, languageModelFor } from './models';
import { Octokit } from 'octokit';
import { retrieveContext } from './rag';
import prisma from '@/lib/db';


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
  } catch (error) {
    console.error(`[Agent] Graph pre-gather failed: ${error instanceof Error ? error.message : String(error)}`);
    return "[Graph] Graph lookup failed. Use read_file and semantic_search to investigate manually.";
  }
}

/**
 * Removes a Markdown code fence that a model wrapped around its patch.
 *
 * The snippet is injected verbatim into a GitHub ```suggestion block, so a stray
 * wrapper fence would terminate that block early and corrupt the comment. But a
 * fence can also be *legitimate content* — e.g. replacing lines that end a code
 * block in a README. Two guards keep us from eating real content:
 *
 *   1. Markdown files are exempt entirely — a fence there is almost always content.
 *      (Observed: a README patch ending in ``` had its closing fence deleted.)
 *   2. In any other file a line containing only ``` cannot be valid source code,
 *      so a leading and/or trailing fence line is safe to drop independently.
 */
function stripWrappingFence(snippet: string, filePath: string): string {
  if (/\.(md|mdx|markdown)$/i.test(filePath)) return snippet;

  const lines = snippet.split("\n");
  if (lines.length < 2) return snippet;

  let start = 0;
  let end = lines.length;
  if (/^\s*```[a-zA-Z0-9_-]*\s*$/.test(lines[start])) start++;
  if (end > start && /^\s*```\s*$/.test(lines[end - 1])) end--;

  return lines.slice(start, end).join("\n");
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
  initialFilePath: string,
  startLine: number,
  endLine: number
) {
  const octokit = new Octokit({ auth: githubToken });

  console.log(`[Agent] Starting ReAct loop for bug in ${initialFilePath} (L${startLine}-${endLine})`);

  let finalPatch = "";
  let finalPlan = "";
  let accumulatedThoughts = "";
  let lastError = "";

  // ── Phase 1: Deterministic Context Gathering (zero LLM cost) ──
  console.log(`[Agent] Phase 1: Gathering graph context from Postgres...`);
  const graphContext = await gatherGraphContext(repoId, initialFilePath);
  console.log(`[Agent] Graph context: ${graphContext.length} chars`);

  // ── Phase 2: ReAct Agent Loop (LLM-driven) ──
  const tools = {
    read_file: tool({
      description:
        'Read a file from the GitHub repository. Provide "path" (string, e.g. "src/utils.ts"). ' +
        'Optionally provide "startLine" and "endLine" (numbers, 1-based, inclusive) to read only that ' +
        'range — strongly preferred for large files. Use exactly these parameter names.',
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
      }),
      execute: async ({ path, startLine: from, endLine: to }) => {
        try {
          console.log(`[Agent] Tool: read_file -> ${path}${from ? ` (L${from}-${to ?? from})` : ""}`);
          const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
          if (Array.isArray(data) || !('content' in data)) return "Error: Path is a directory, not a file.";
          const text = Buffer.from(data.content, "base64").toString("utf-8");
          const lines = text.split("\n");

          // Explicit range requested — return just that slice.
          if (from !== undefined) {
            const lo = Math.max(1, from);
            const hi = Math.min(lines.length, to ?? from);
            if (lo > lines.length) return `Error: ${path} has only ${lines.length} lines.`;
            const slice = lines.slice(lo - 1, hi).join("\n");
            return `[${path} lines ${lo}-${hi} of ${lines.length}]\n${slice}`;
          }

          // Whole-file read. Cap it: the full history is re-sent on every step, so
          // an unbounded large file dominates the token budget (and previously blew
          // the function timeout on a 1281-line file).
          const MAX_WHOLE_FILE_LINES = 400;
          if (lines.length > MAX_WHOLE_FILE_LINES) {
            const head = lines.slice(0, MAX_WHOLE_FILE_LINES).join("\n");
            return `[${path} is ${lines.length} lines — showing first ${MAX_WHOLE_FILE_LINES}. Call read_file again with startLine/endLine to see the region you care about.]\n${head}`;
          }
          return `[${path} lines 1-${lines.length} of ${lines.length}]\n${text}`;
        } catch (error) {
          return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
    query_ast_callers: tool({
      description: 'Find other files that call a specific function to prevent breaking dependent code. Provide "symbolName" (string).',
      inputSchema: z.object({ symbolName: z.string() }),
      execute: async ({ symbolName }) => {
        try {
          console.log(`[Agent] Tool: query_ast_callers -> ${symbolName}`);
          const symbols = await prisma.symbol.findMany({ where: { repositoryId: repoId, qualifiedName: { contains: symbolName } }, take: 5 });
          if (symbols.length === 0) return "Symbol not found in AST graph.";
          const callers = await prisma.edge.findMany({ where: { targetSymbolId: { in: symbols.map(s => s.id) }, kind: 'CALLS' }, include: { sourceSymbol: true } });
          if (callers.length === 0) return "No callers found. It is safe to modify.";
          return JSON.stringify(callers.map(c => ({ caller: c.sourceSymbol.qualifiedName, file: c.sourceSymbol.path })));
        } catch (error) {
          return `Error querying graph: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
    semantic_search: tool({
      description: 'Search the Pinecone vector database for code related to an abstract concept. Provide "query" (string). Use this ONLY if the graph context above is insufficient.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          console.log(`[Agent] Tool: semantic_search -> "${query}"`);
          // Indexing writes graph symbols under the repository CUID and plain text
          // files under the "owner/repo" string (see inngest/functions/index.ts).
          // Query both namespaces so the agent can see non-parsed files too.
          const [symbolHits, fileHits] = await Promise.all([
            retrieveContext(query, repoId, 3),
            retrieveContext(query, `${owner}/${repo}`, 3),
          ]);
          const contexts = Array.from(new Set([...(symbolHits ?? []), ...(fileHits ?? [])]));
          if (contexts.length === 0) return "No related code found.";
          return contexts.join("\n\n---\n\n");
        } catch (error) {
          return `Error in semantic search: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
    write_plan: tool({
      description: 'Record your root cause analysis and step-by-step plan before writing code. Provide "analysis" (string) and "plan" (string).',
      inputSchema: z.object({ analysis: z.string(), plan: z.string() }),
      execute: async ({ analysis, plan }) => {
        console.log(`[Agent] Tool: write_plan recorded.`);
        finalPlan = `**Analysis:**\n${analysis}\n\n**Plan:**\n${plan}`;
        return "Plan saved successfully. You MUST now use propose_patch to submit the final code.";
      },
    }),
    propose_patch: tool({
      description: `Submit the final fixed snippet. Provide "path" (string, file path) and "fixedSnippet" (string, raw code that replaces EXACTLY lines ${startLine}-${endLine} of ${initialFilePath} — no surrounding lines, no diff markers, no code fences).`,
      inputSchema: z.object({
        path: z.string(),
        fixedSnippet: z.string(),
      }),
      execute: async ({ path, fixedSnippet }) => {
        console.log(`[Agent] Tool: propose_patch -> ${path}`);
        finalPatch = stripWrappingFence(fixedSnippet, initialFilePath);
        return "Patch saved. You have completed your task.";
      },
    }),
  };

  const systemPrompt = `You are an autonomous Senior Engineering Agent. 
Your goal is to fix the following bug in the repository ${owner}/${repo}:
"${bugFinding}"

The bug is located in file: ${initialFilePath}, lines ${startLine}-${endLine}.

=== CODE GRAPH CONTEXT (pre-gathered from Postgres AST — advisory, not ground truth) ===
${graphContext}

IMPORTANT — how to interpret this graph:
- [EXTRACTED] edges are PROVEN (derived from explicit imports). Treat as facts.
- [RESOLVED] edges are HIGH-CONFIDENCE (cross-file heuristics). Treat as likely true.
- [INFERRED] edges are GUESSES (e.g. from this.service.method() patterns). Treat as hints only.
- This graph reflects the repo state AT INDEX TIME. The PR may have already modified some callers.
- Always verify callers by reading the actual files before assuming a dependency is real.
======================================================================================

=== PATCH CONTRACT (read this before calling propose_patch) ===
Your 'fixedSnippet' is posted to GitHub as a suggested-change block that REPLACES
EXACTLY lines ${startLine}-${endLine} of ${initialFilePath} — that is ${endLine - startLine + 1} line(s).
Therefore your snippet MUST:
- Be a drop-in replacement for ONLY those lines. Do not include any line outside that range.
- Preserve the original leading indentation of line ${startLine}. GitHub inserts your text verbatim.
- Contain raw code ONLY. No diff markers (+/-), no line numbers, no \`\`\` fences, no commentary.
- Stay syntactically valid once substituted into the surrounding code you read with read_file.
If the correct fix cannot be expressed inside lines ${startLine}-${endLine}, still emit the best
self-contained replacement for that range and explain the remaining work in 'write_plan'.
==============================================================

You have access to these tools: read_file, query_ast_callers, semantic_search, write_plan, propose_patch.

You MUST follow the ReAct loop:
1. OBSERVE: Use 'read_file' to read ${initialFilePath}. The file is the ground truth — the graph is just orientation. Locate lines ${startLine}-${endLine} and count exactly what you must replace.
2. INVESTIGATE: If the graph shows EXTRACTED callers, use 'query_ast_callers' to verify they still exist. Only use 'semantic_search' if the graph is empty or you need abstract concept lookup.
3. PLAN: Use 'write_plan' to record your root cause analysis and step-by-step fix.
4. ACT: Use 'propose_patch' to output the corrected code snippet. Do not guess syntax.

IMPORTANT: Do NOT spend more than 2 steps on semantic_search. The graph and read_file are your primary tools.`;

  // ── Phase 3: run the loop against the agent chain ──
  // Fail over per RUN, not per call: a half-finished investigation against a dead
  // provider is worthless, and swapping models mid-conversation mixes two
  // different tool-calling behaviours. The first layer that gets through keeps
  // the run. AI_AGENT_CHAIN controls the order.
  const chain = getAgentChain();
  const chainErrors: string[] = [];

  for (const layer of chain) {
    const label = `${layer.door}:${layer.model}`;
    console.log(`[Agent] Booting agent using ${label}`);

    // Reset per-attempt state so a failed layer can't leak into the next.
    finalPatch = "";
    finalPlan = "";
    accumulatedThoughts = "";
    lastError = "";

    let messages: ModelMessage[] = [
      {
        role: 'user',
        content: "Begin your investigation and fix."
      }
    ];

    const MAX_STEPS = 10;
    let model;
    try {
      model = languageModelFor(layer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Agent] ${label} unavailable — ${message}`);
      chainErrors.push(`${label}: ${message}`);
      continue;
    }

    let providerFailed = false;

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

      let result;
      try {
        result = await generateText({ model, system: systemPrompt, messages, tools });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // A malformed tool call (wrong parameter names, extra properties) is recoverable:
        // some providers — Groq notably — validate tool arguments server-side and reject
        // the whole request. Feed the error back and let the agent correct itself rather
        // than losing the entire run to one bad call.
        const isRecoverable =
          /tool call validation|did not match schema|additionalProperties|InvalidToolInput|Invalid JSON/i.test(message);

        if (!isRecoverable) {
          // Provider-level failure (auth, quota, model not found) — try the next layer.
          console.error(`[Agent] ${label} failed on step ${step + 1} — ${message}`);
          chainErrors.push(`${label}: ${message}`);
          providerFailed = true;
          break;
        }

        console.warn(`[Agent] Recoverable tool-call error on step ${step + 1}: ${message}`);
        lastError = message;
        messages.push({
          role: 'user',
          content:
            `[System: your last tool call was rejected: ${message}]\n` +
            `Use ONLY the exact parameter names declared in each tool's schema. Do not invent extra parameters. Retry.`,
        });
        continue;
      }

      if (result.text) {
        accumulatedThoughts += result.text + "\n";
      }

      // Append assistant's response and tool results to history
      messages = messages.concat(result.responseMessages);

      if (!result.toolCalls || result.toolCalls.length === 0) {
        break; // No more tool calls, agent is done
      }

      if (finalPatch !== "") {
        break; // We got the patch, exit early
      }
    }

    if (providerFailed) continue; // this door is down — try the next

    // The provider worked. Whether or not the model produced a patch, that is
    // the model's answer — don't spend the next layer's budget re-running it.
    if (chainErrors.length > 0) {
      console.warn(`[Agent] completed on ${label} after ${chainErrors.length} failed layer(s).`);
    }
    return {
      success: finalPatch !== "",
      plan: finalPlan,
      patch: finalPatch,
      agentThoughts: accumulatedThoughts,
      lastError,
      modelUsed: label
    };
  }

  // Every layer failed at the provider level.
  return {
    success: false,
    plan: "",
    patch: "",
    agentThoughts: "",
    lastError: `every agent layer failed — ${chainErrors.join("; ")}`,
    modelUsed: chain.map((l) => `${l.door}:${l.model}`).join(" → ")
  };
}
