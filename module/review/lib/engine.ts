import {
  retrieveContext,
  retrieveContextForDiff,
  type RetrievedChunk,
} from "@/module/ai/lib/rag";
import { generateTextWithFallback } from "@/module/ai/lib/models";

export type RunReviewInput = {
  diff: string;
  title: string;
  description: string;
  repoId: string;
  options?: {
    // For eval / offline runs where the repo isn't indexed in Pinecone.
    skipRetrieval?: boolean;
  };
};

export type RetrievalMode = "diff" | "fallback" | "skipped";

export type RunReviewMeta = {
  retrievalMode: RetrievalMode;
  chunkCount: number;
  provider: string;
};

export type RunReviewResult = {
  output: string;
  latencyMs: number;
  meta: RunReviewMeta;
};

async function retrieve(input: RunReviewInput): Promise<{
  chunks: RetrievedChunk[];
  mode: RetrievalMode;
}> {
  if (input.options?.skipRetrieval) return { chunks: [], mode: "skipped" };

  const diffChunks = await retrieveContextForDiff(input.diff, input.repoId);
  if (diffChunks.length > 0) return { chunks: diffChunks, mode: "diff" };

  const fallback =
    (await retrieveContext(
      `${input.title}\n${input.description}`,
      input.repoId
    )) ?? [];
  const chunks: RetrievedChunk[] = fallback.map((content) => ({
    path: "(unknown)",
    content,
    score: 0,
  }));
  return { chunks, mode: "fallback" };
}

function formatContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "(no relevant context retrieved from the codebase index)";
  }
  return chunks
    .map(
      (c) =>
        `### ${c.path}${c.score ? ` (relevance ${c.score.toFixed(2)})` : ""}\n${c.content}`
    )
    .join("\n\n");
}

function buildPrompt(input: RunReviewInput, chunks: RetrievedChunk[]): string {
  const contextBlock = formatContextBlock(chunks);
  return `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.

PR Title: ${input.title}
PR Description: ${input.description || "No description provided"}

Context from Codebase (retrieved per-hunk from the diff; each snippet is labeled with its file path):
${contextBlock}

Code Changes:
\`\`\`diff
${input.diff}
\`\`\`

Please provide:
1. **Walkthrough**: A file-by-file explanation of the changes. Keep it short and to the point.
2. **Sequence Diagram**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. IMPORTANT: Ensure the Mermaid syntax is valid. Do not use special characters inside Note text or labels. Keep the diagram simple.
3. **Summary**: Brief overview.
4. **Strengths**: What's done well.
5. **Issues**: Bugs, security concerns, code smells.
6. **Suggestions**: Specific code improvements.

Format your response in markdown.`;
}

export async function runReview(
  input: RunReviewInput
): Promise<RunReviewResult> {
  const startedAt = Date.now();
  const { chunks, mode } = await retrieve(input);
  const prompt = buildPrompt(input, chunks);
  const { text } = await generateTextWithFallback(prompt);
  const latencyMs = Date.now() - startedAt;
  return {
    output: text,
    latencyMs,
    meta: {
      retrievalMode: mode,
      chunkCount: chunks.length,
      provider: process.env.AI_PROVIDER ?? "google",
    },
  };
}
