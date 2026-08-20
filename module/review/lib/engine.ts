import { z } from "zod";
import {
  retrieveContext,
  retrieveContextForDiff,
  type RetrievedChunk,
} from "@/module/ai/lib/rag";
import { generateObjectWithFallback } from "@/module/ai/lib/models";
// @ts-ignore
import parseDiff from "parse-diff";

export const reviewSchema = z.object({
  summary: z.string().describe("Brief overview of the changes"),
  walkthrough: z.string().describe("A file-by-file explanation of the changes"),
  sequenceDiagram: z.string().describe("A Mermaid JS sequence diagram visualizing the flow, if applicable. Return empty string if none."),
  strengths: z.array(z.string()).describe("What is done well"),
  findings: z.array(
    z.object({
      file: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      severity: z.enum(["critical", "warning", "nit"]),
      category: z.enum(["bug", "security", "performance", "style", "best-practice"]),
      claim: z.string().describe("The core issue found"),
      evidence: z.string().describe("Code snippets or logic proving the claim"),
      suggestion: z.string().describe("Actionable fix"),
    })
  ).describe("Bugs, security concerns, code smells, or issues found"),
});

export type ReviewOutput = z.infer<typeof reviewSchema>;

export const verifySchema = z.object({
  verdicts: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(["verified", "rejected"]),
      rationale: z.string().describe("Explanation of why this is a real issue or why it's a false positive")
    })
  )
});

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
  structured: ReviewOutput;
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

Provide a comprehensive review using the provided JSON schema. Ensure all findings include specific file paths and line numbers that match the diff.`;
}

async function verifyFindings(
  input: RunReviewInput,
  chunks: RetrievedChunk[],
  initialFindings: ReviewOutput["findings"]
): Promise<ReviewOutput["findings"]> {
  if (initialFindings.length === 0) return [];

  const contextBlock = formatContextBlock(chunks);
  const prompt = `You are a senior defense engineer. The following code issues were reported by an automated reviewer on this pull request.
Your job is to ruthlessly scrutinize these findings. LLMs often hallucinate false positives, nitpicks, or issues that are not actually bugs. 
If a finding is a false positive, hallucinated, or a minor nitpick that a human wouldn't care about, mark it as "rejected".
If it is a genuine, undeniable issue supported by the code, mark it as "verified".

Code Changes:
\`\`\`diff
${input.diff}
\`\`\`

Context from Codebase:
${contextBlock}

Reported Findings to Verify:
${JSON.stringify(initialFindings, null, 2)}

Provide your verdicts using the JSON schema.`;

  try {
    const { object } = await generateObjectWithFallback(prompt, verifySchema);
    
    // Filter the initial findings based on the verdicts
    const verifiedFindings = initialFindings.filter(finding => {
      const match = object.verdicts.find(v => v.claim === finding.claim);
      return match?.verdict === "verified";
    });

    return verifiedFindings;
  } catch (error) {
    console.error("[engine] Verification pass failed, returning original findings:", error);
    return initialFindings; // Fallback to returning all if the verify pass crashes
  }
}

function formatReviewAsMarkdown(review: ReviewOutput): string {
  const parts: string[] = [];

  parts.push(`## Summary\n${review.summary}\n`);
  parts.push(`## Walkthrough\n${review.walkthrough}\n`);

  if (review.sequenceDiagram) {
    parts.push(`## Flow\n\`\`\`mermaid\n${review.sequenceDiagram}\n\`\`\`\n`);
  }

  if (review.strengths.length > 0) {
    parts.push(`## Strengths\n${review.strengths.map((s) => `- ${s}`).join("\n")}\n`);
  }

  if (review.findings.length > 0) {
    parts.push(`## Findings\n`);
    for (const f of review.findings) {
      const emoji =
        f.severity === "critical"
          ? "🚨"
          : f.severity === "warning"
          ? "⚠️"
          : "💡";
      parts.push(
        `### ${emoji} [${f.category}] \`${f.file}:${f.startLine}-${f.endLine}\``
      );
      parts.push(`**Issue:** ${f.claim}`);
      parts.push(`**Evidence:** ${f.evidence}`);
      parts.push(`**Suggestion:** ${f.suggestion}\n`);
    }
  } else {
    parts.push(`## Findings\nNo significant issues found! 🎉\n`);
  }

  return parts.join("\n\n");
}

function performExistenceChecks(
  diffText: string,
  findings: ReviewOutput["findings"]
): ReviewOutput["findings"] {
  const parsed = parseDiff(diffText);
  
  return findings.filter(finding => {
    // 1. Check if the file is in the diff
    const fileDiff = parsed.find(
      (file: any) => file.to === finding.file || file.from === finding.file
    );
    
    if (!fileDiff) {
      console.warn(`[Existence Check] Dropped finding for ${finding.file}: File not found in diff.`);
      return false;
    }
    
    // 2. Check if the line number is within the modified hunks on the right side
    const lineExists = fileDiff.chunks.some((chunk: any) => {
      return chunk.changes.some((change: any) => {
        const rightLine = change.type === "normal" ? change.ln2 : (change.type === "add" ? change.ln : null);
        return rightLine === finding.startLine;
      });
    });
    
    if (!lineExists) {
      console.warn(`[Existence Check] Dropped finding for ${finding.file}:${finding.startLine}: Line not in diff hunks.`);
      return false;
    }
    
    return true;
  });
}

export async function runReview(
  input: RunReviewInput
): Promise<RunReviewResult> {
  const startedAt = Date.now();
  const { chunks, mode } = await retrieve(input);
  const prompt = buildPrompt(input, chunks);
  
  const { object } = await generateObjectWithFallback(prompt, reviewSchema);
  
  // Phase 0.4: Adversarial Verify Pass (The Defense Attorney)
  const verifiedFindings = await verifyFindings(input, chunks, object.findings);
  
  // Phase 0.5: Existence Checks (The Judge)
  const groundedFindings = performExistenceChecks(input.diff, verifiedFindings);
  
  object.findings = groundedFindings;
  
  const markdownOutput = formatReviewAsMarkdown(object);
  
  const latencyMs = Date.now() - startedAt;
  return {
    output: markdownOutput,
    structured: object,
    latencyMs,
    meta: {
      retrievalMode: mode,
      chunkCount: chunks.length,
      provider: process.env.AI_PROVIDER ?? "google",
    },
  };
}
