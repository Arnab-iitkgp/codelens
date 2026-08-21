import { z } from "zod";
import { generateObjectWithFallback } from "@/module/ai/lib/models";
import parseDiff from "parse-diff";
import { gatherReviewContext, InvestigatedChunk } from "./investigator";

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
      confidence: z.string().describe("Confidence score of the finding (e.g. 3/3 votes). Use empty string if not applicable."),
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
  architectureProfile?: string | null;
  reviewMode?: "fast" | "standard" | "full";
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
  trace: {
    chunks: InvestigatedChunk[];
    initialFindings: ReviewOutput["findings"];
    verifiedFindings: ReviewOutput["findings"];
  };
};

async function retrieve(input: RunReviewInput): Promise<{
  chunks: InvestigatedChunk[];
  mode: RetrievalMode;
}> {
  if (input.options?.skipRetrieval) return { chunks: [], mode: "skipped" };

  const chunks = await gatherReviewContext(input.repoId, input.diff);
  
  if (chunks.length > 0) {
    const hasGraph = chunks.some(c => c.type === "graph");
    return { chunks, mode: hasGraph ? "diff" : "fallback" }; 
  }

  return { chunks: [], mode: "fallback" };
}

function formatContextBlock(chunks: InvestigatedChunk[]): string {
  if (chunks.length === 0) {
    return "(no relevant context retrieved from the codebase index)";
  }
  return chunks
    .map(
      (c) =>
        `### ${c.path} [${c.type.toUpperCase()}]${c.score ? ` (relevance ${c.score.toFixed(2)})` : ""}\n${c.content}`
    )
    .join("\n\n");
}

function buildPrompt(input: RunReviewInput, chunks: InvestigatedChunk[]): string {
  const contextBlock = formatContextBlock(chunks);

  let profileSection = "";
  if (input.architectureProfile) {
    profileSection = `\n# Repository Architecture Profile\nThis repository has the following architectural conventions and stack. You MUST respect these conventions. Do not flag code as a "code smell" if it aligns with these conventions.\n${input.architectureProfile}\n`;
  }

  return `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.
${profileSection}
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



async function verifySingleLens(
  input: RunReviewInput,
  chunks: InvestigatedChunk[],
  initialFindings: ReviewOutput["findings"],
  lensFocus: string
) {
  const contextBlock = formatContextBlock(chunks);
  const prompt = `You are a senior defense engineer. The following code issues were reported by an automated reviewer on this pull request.
Your job is to ruthlessly scrutinize these findings. LLMs often hallucinate false positives, nitpicks, or issues that are not actually bugs. 
${lensFocus}
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
    return object.verdicts;
  } catch (error) {
    console.error("[engine] Verification pass failed:", error);
    return [];
  }
}

async function verifyFindings(
  input: RunReviewInput,
  chunks: InvestigatedChunk[],
  initialFindings: ReviewOutput["findings"],
  mode: "fast" | "standard" | "full" = "fast"
): Promise<ReviewOutput["findings"]> {
  if (initialFindings.length === 0) return [];

  if (mode === "fast") {
    // 1x Verify
    const verdicts = await verifySingleLens(
      input, chunks, initialFindings, 
      "Evaluate the findings generally for correctness, security, and performance."
    );
    
    return initialFindings.filter(finding => {
      const match = verdicts.find(v => v.claim === finding.claim);
      if (match?.verdict === "verified") {
        finding.confidence = "1/1";
        return true;
      }
      return false;
    });
  }

  // 3x Majority Vote (standard | full)
  const [correctness, security, runtime] = await Promise.all([
    verifySingleLens(input, chunks, initialFindings, "Focus EXCLUSIVELY on logic errors, off-by-one errors, state management, and type safety. Reject style nits or theoretical issues."),
    verifySingleLens(input, chunks, initialFindings, "Focus EXCLUSIVELY on injection, auth bypass, race conditions, and data leakage. Reject general code quality nits."),
    verifySingleLens(input, chunks, initialFindings, "Focus EXCLUSIVELY on performance, memory leaks, unhandled edge cases, and environment assumptions. Reject stylistic complaints.")
  ]);

  const verifiedFindings: ReviewOutput["findings"] = [];

  for (const finding of initialFindings) {
    let votes = 0;
    if (correctness.find(v => v.claim === finding.claim)?.verdict === "verified") votes++;
    if (security.find(v => v.claim === finding.claim)?.verdict === "verified") votes++;
    if (runtime.find(v => v.claim === finding.claim)?.verdict === "verified") votes++;

    // Majority vote (2 out of 3)
    if (votes >= 2) {
      finding.confidence = `${votes}/3`;
      verifiedFindings.push(finding);
    } else {
      console.log(`[engine] Dropped finding (only ${votes}/3 votes): ${finding.claim}`);
    }
  }

  return verifiedFindings;
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
        `### ${emoji} [${f.category}] \`${f.file}:${f.startLine}-${f.endLine}\` ${f.confidence ? `(Confidence: ${f.confidence})` : ""}`
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
      (file: parseDiff.File) => file.to === finding.file || file.from === finding.file
    );
    
    if (!fileDiff) {
      console.warn(`[Existence Check] Dropped finding for ${finding.file}: File not found in diff.`);
      return false;
    }
    
    // 2. Check if the line number is within the modified hunks on the right side
    const lineExists = fileDiff.chunks.some((chunk: parseDiff.Chunk) => {
      return chunk.changes.some((change: parseDiff.Change) => {
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

function chunkDiff(diff: string, maxChars = 12000): string[] {
  // Split by file (using lookahead for diff --git)
  const fileDiffs = diff.split(/(?=^diff --git )/m).filter(d => d.trim().length > 0);
  
  const chunks: string[] = [];
  let currentChunk = "";

  for (const fileDiff of fileDiffs) {
    if (currentChunk.length + fileDiff.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += fileDiff;
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [diff]; // Fallback to raw diff if splitting fails
}

export async function runReview(
  input: RunReviewInput
): Promise<RunReviewResult> {
  const startedAt = Date.now();
  
  // 1. Chunk the diff
  const diffChunks = chunkDiff(input.diff, 12000);
  console.log(`[engine] Diff split into ${diffChunks.length} chunks for processing.`);

  const allInitialFindings: ReviewOutput["findings"] = [];
  const allVerifiedFindings: ReviewOutput["findings"] = [];
  const allChunks: InvestigatedChunk[] = [];
  const summaries: string[] = [];
  const walkthroughs: string[] = [];
  const strengths: string[] = [];
  let sequenceDiagram = "";
  let overallRetrievalMode: RetrievalMode = "skipped";
  let totalRetrievedChunks = 0;
  
  // 2. Process each chunk in parallel
  const reviewModeSetting = input.reviewMode ?? "fast";
  const provider = process.env.AI_PROVIDER ?? "google";

  const chunkPromises = diffChunks.map(async (diffChunk) => {
    const { chunks, mode } = await retrieve({ ...input, diff: diffChunk });
    if (mode === "diff") overallRetrievalMode = "diff";
    if (mode === "fallback" && overallRetrievalMode === "skipped") overallRetrievalMode = "fallback";
    
    const prompt = buildPrompt({ ...input, diff: diffChunk }, chunks);
    
    const { object } = await generateObjectWithFallback(prompt, reviewSchema);
    
    const rawInitialFindings = JSON.parse(JSON.stringify(object.findings));
    const verifiedFindings = await verifyFindings(input, chunks, object.findings, reviewModeSetting);
    const groundedFindings = performExistenceChecks(diffChunk, verifiedFindings);
    
    return {
      object,
      groundedFindings,
      rawInitialFindings,
      retrievedChunks: chunks
    };
  });

  const results = await Promise.all(chunkPromises);

  // 3. Merge results
  for (const res of results) {
    allInitialFindings.push(...res.rawInitialFindings);
    allVerifiedFindings.push(...res.groundedFindings);
    allChunks.push(...res.retrievedChunks);
    
    if (res.object.summary) summaries.push(res.object.summary);
    if (res.object.walkthrough) walkthroughs.push(res.object.walkthrough);
    if (res.object.strengths) strengths.push(...res.object.strengths);
    if (res.object.sequenceDiagram && !sequenceDiagram) sequenceDiagram = res.object.sequenceDiagram;
    totalRetrievedChunks += res.retrievedChunks.length;
  }

  // Deduplicate strengths and retrieved chunks
  const uniqueStrengths = Array.from(new Set(strengths));
  const uniqueChunks = Array.from(new Map(allChunks.map(c => [c.content, c])).values());

  const mergedObject: ReviewOutput = {
    summary: summaries.join("\n\n---\n\n"),
    walkthrough: walkthroughs.join("\n\n"),
    sequenceDiagram,
    strengths: uniqueStrengths,
    findings: allVerifiedFindings
  };

  const markdownOutput = formatReviewAsMarkdown(mergedObject);
  
  const latencyMs = Date.now() - startedAt;
  return {
    output: markdownOutput,
    structured: mergedObject,
    latencyMs,
    meta: {
      retrievalMode: overallRetrievalMode,
      chunkCount: totalRetrievedChunks,
      provider,
    },
    trace: {
      chunks: uniqueChunks,
      initialFindings: allInitialFindings,
      verifiedFindings: allVerifiedFindings
    }
  };
}
