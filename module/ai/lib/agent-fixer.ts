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
 * Runs a true ReAct (Reasoning + Acting) Agent loop to auto-fix a bug using Graph-Augmentation.
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

  const tools = {
    read_file: tool({
      description: 'Read the raw contents of a file from the GitHub repository.',
      parameters: z.object({
        path: z.string().describe('The file path to read (e.g., src/app.ts)'),
      }),
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
      description: 'Find other files that call a specific function to prevent breaking dependent code.',
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
      description: 'Search the Pinecone vector database for abstract concepts.',
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
      description: 'Record your root cause analysis and step-by-step plan before writing code.',
      parameters: z.object({ analysis: z.string(), plan: z.string() }),
      // @ts-ignore: Type inference fails due to zod version mismatch
      execute: async ({ analysis, plan }) => {
        console.log(`[Agent] Tool: write_plan recorded.`);
        finalPlan = `**Analysis:**\n${analysis}\n\n**Plan:**\n${plan}`;
        return "Plan saved successfully. You MUST now use propose_patch to submit the final code.";
      },
    }) as any,
    propose_patch: tool({
      description: 'Submit the final fixed snippet for the file.',
      parameters: z.object({
        path: z.string().describe('The path of the file you fixed.'),
        fixedSnippet: z.string().describe('The exact replacement code snippet. DO NOT output the entire file, only the lines that need to change.'),
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

You have access to a Postgres AST Graph and a Pinecone Vector Database.
You MUST follow this exact sequence:
1. Use 'read_file' to see the exact code in ${initialFilePath}.
2. If you need to understand callers/dependencies, use 'query_ast_callers'.
3. If you need to find an abstract concept, use 'semantic_search'.
4. Use 'write_plan' to record your root cause analysis and step-by-step fix.
5. Use 'propose_patch' to output the final, corrected file content. Do not guess syntax.`;

  let messages: any[] = [
    {
      role: 'user',
      content: "Begin your investigation and fix."
    }
  ];

  for (let step = 0; step < 7; step++) {
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
