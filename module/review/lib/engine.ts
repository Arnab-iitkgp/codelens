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
      affects: z.array(z.string()).describe("A list of file paths (e.g. 'src/utils.ts') that call this code and will break because they weren't updated in the diff. Return an empty array [] if none."),
      confidence: z.string().describe("Confidence score of the finding (e.g. 3/3 votes). Use empty string if not applicable."),
    })
  ).describe("Bugs, security concerns, code smells, or issues found"),
});

export type ReviewOutput = z.infer<typeof reviewSchema>;

/**
 * What a single diff CHUNK is asked for. Deliberately excludes summary /
 * walkthrough / sequenceDiagram: a chunk only sees its own slice, so asking each
 * one for a whole-PR narrative produced N partial summaries concatenated with
 * "---" separators — the main cause of enormous reviews, and incoherent besides.
 * The narrative comes from one structure-scan call instead (D-010 Option B).
 */
const chunkFindingsSchema = z.object({
  strengths: z.array(z.string()).describe("What is done well in this part of the diff"),
  findings: reviewSchema.shape.findings,
});

/** What the single structure-scan call produces for the whole PR. */
const narrativeSchema = z.object({
  summary: reviewSchema.shape.summary,
  walkthrough: reviewSchema.shape.walkthrough,
  sequenceDiagram: reviewSchema.shape.sequenceDiagram,
});

export const verifySchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string().describe("The ID of the finding being verified"),
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
  changedLines: number;
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

Provide a comprehensive review using the provided JSON schema. Ensure all findings include specific file paths and line numbers that match the diff.
If the PR modifies a function's signature, return type, or behavior, you MUST check the provided [CALLERS] context. 
If those callers rely on the old behavior and were not updated in the PR diff, you MUST flag it as a bug and list the broken callers in the 'affects' array!`;
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

Provide your verdicts using the JSON schema. Be sure to return the exact 'id' for each finding.`;

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

  // Assign temporary IDs to prevent string-matching failures when the LLM paraphrases the claim
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findingsWithIds: any[] = initialFindings.map((f, i) => ({ id: `finding-${i}`, ...f }));

  if (mode === "fast") {
    // 1x Verify
    const verdicts = await verifySingleLens(
      input, chunks, findingsWithIds, 
      "Evaluate the findings generally for correctness, security, and performance."
    );
    
    return initialFindings.filter((finding, i) => {
      const match = verdicts.find(v => v.id === `finding-${i}`);
      if (match?.verdict === "verified") {
        finding.confidence = "1/1";
        return true;
      }
      return false;
    });
  }

  // 3x Majority Vote (standard | full)
  // We use 3 generalist personas instead of strict specialists.
  // Strict specialists (e.g. "Focus EXCLUSIVELY on security") will always reject correctness bugs, 
  // making a 2/3 majority mathematically impossible for standard bugs.
  const [reviewerA, reviewerB, reviewerC] = await Promise.all([
    verifySingleLens(input, chunks, findingsWithIds, "Act as a Senior Frontend/Backend Engineer. Evaluate all findings for correctness, security, and performance. If a finding is a genuine logic error, security flaw, or performance issue, verify it. Reject false positives and trivial style nits."),
    verifySingleLens(input, chunks, findingsWithIds, "Act as a Principal Architect. Evaluate all findings for correctness, security, and performance. If a finding is a genuine logic error, security flaw, or performance issue, verify it. Reject false positives and trivial style nits."),
    verifySingleLens(input, chunks, findingsWithIds, "Act as a QA & Reliability Expert. Evaluate all findings for correctness, security, and performance. If a finding is a genuine logic error, security flaw, or performance issue, verify it. Reject false positives and trivial style nits.")
  ]);

  const verifiedFindings: ReviewOutput["findings"] = [];

  for (let i = 0; i < initialFindings.length; i++) {
    const finding = initialFindings[i];
    const findingId = `finding-${i}`;
    let votes = 0;
    
    if (reviewerA.find(v => v.id === findingId)?.verdict === "verified") votes++;
    if (reviewerB.find(v => v.id === findingId)?.verdict === "verified") votes++;
    if (reviewerC.find(v => v.id === findingId)?.verdict === "verified") votes++;

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

function renderFinding(f: ReviewOutput["findings"][number]): string[] {
  const emoji =
    f.severity === "critical" ? "🚨" : f.severity === "warning" ? "⚠️" : "💡";
  const parts: string[] = [];
  parts.push(
    `### ${emoji} [${f.category}] \`${f.file}:${f.startLine}-${f.endLine}\` ${f.confidence ? `(Confidence: ${f.confidence})` : ""}`
  );
  parts.push(`**Issue:** ${f.claim}`);
  parts.push(`**Evidence:** ${f.evidence}`);
  parts.push(`**Suggestion:** ${f.suggestion}`);
  if (f.affects && f.affects.length > 0) {
    parts.push(`💥 **Blast Radius (Regression Risk):**\n${f.affects.map(a => `- \`${a}\``).join("\n")}`);
  }
  parts.push("");
  return parts;
}

function formatReviewAsMarkdown(review: ReviewOutput, changedLines = 0): string {
  const parts: string[] = [];

  parts.push(`## Summary\n${review.summary}\n`);
  parts.push(`## Walkthrough\n${review.walkthrough}\n`);

  if (review.sequenceDiagram && review.sequenceDiagram.trim() !== "") {
    let cleanDiagram = review.sequenceDiagram.trim();
    cleanDiagram = cleanDiagram
      .replace(/^```mermaid\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    if (cleanDiagram) {
      parts.push(`## Flow\n\`\`\`mermaid\n${cleanDiagram}\n\`\`\`\n`);
    }
  }

  if (review.strengths.length > 0) {
    parts.push(`## Strengths\n${review.strengths.map((s) => `- ${s}`).join("\n")}\n`);
  }

  if (review.findings.length > 0) {
    // High-signal findings are shown; the rest are collapsed rather than dropped.
    const { primary, secondary } = partitionFindings(review.findings, changedLines);

    parts.push(`## Findings\n`);
    for (const f of primary) parts.push(...renderFinding(f));

    if (secondary.length > 0) {
      const body = secondary.flatMap(renderFinding).join("\n\n");
      parts.push(
        `<details>\n<summary>${secondary.length} additional finding(s)</summary>\n\n${body}\n</details>\n`
      );
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
    
    // 2. Gather all valid right-side line numbers in the diff hunks
    const validLines: number[] = [];
    for (const chunk of fileDiff.chunks) {
      for (const change of chunk.changes) {
        if (change.type === "normal") validLines.push(change.ln2);
        else if (change.type === "add") validLines.push(change.ln);
      }
    }
    
    if (validLines.length === 0) return false;
    
    if (validLines.includes(finding.startLine)) {
      return true; // Exact match
    }
    
    // 3. Snap to closest valid line to fix LLM line-number hallucinations
    const closestLine = validLines.reduce((prev, curr) => 
      Math.abs(curr - finding.startLine) < Math.abs(prev - finding.startLine) ? curr : prev
    );
    
    // If the hallucinated line is within 25 lines of a diff hunk, snap it to the hunk.
    // This allows findings on 'context' lines that fell just outside the 3-line patch window to survive!
    if (Math.abs(closestLine - finding.startLine) <= 25) {
      console.log(`[Existence Check] Snapping line ${finding.startLine} -> ${closestLine} for ${finding.file}`);
      const lineDelta = Math.max(0, finding.endLine - finding.startLine);
      finding.startLine = closestLine;
      finding.endLine = closestLine + lineDelta;
      return true;
    }
    
    console.warn(`[Existence Check] Dropped finding for ${finding.file}:${finding.startLine}: Too far from diff hunks.`);
    return false;
  });
}

function filterNoiseFilesFromDiff(diff: string): string {
  const fileDiffs = diff.split(/(?=^diff --git )/m);
  
  const noisyExtensions = /\.(svg|png|jpg|jpeg|gif|ico|pdf|zip|tar|gz|mp4|webm|woff|woff2|ttf|eot)$/i;
  const noisyFiles = /package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml/i;
  const minified = /\.min\.(js|css)$/i;

  const filteredDiffs = fileDiffs.filter(fileDiff => {
    const match = fileDiff.match(/^diff --git a\/(.+?) b\//m);
    if (!match) return true; // Keep if we can't parse the header
    
    const filename = match[1];
    if (noisyExtensions.test(filename)) return false;
    if (noisyFiles.test(filename)) return false;
    if (minified.test(filename)) return false;
    
    return true;
  });

  return filteredDiffs.join("");
}

function chunkDiff(diff: string, maxChars = 12000): string[] {
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

/** Counts added/removed lines, used to scale how noisy a review is allowed to be. */
function countChangedLines(diff: string): number {
  let n = 0;
  for (const line of diff.split("\n")) {
    if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")) n++;
  }
  return n;
}

/**
 * Reduces the diff to its skeleton — file headers and hunk headers only, no code.
 * Cheap enough to send whole even for a large PR, and it is the only view that
 * can produce a coherent whole-PR narrative.
 */
function buildStructureView(diff: string): string {
  const lines: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      lines.push(`\nFILE: ${m ? m[2] : line.replace("diff --git ", "")}`);
    } else if (line.startsWith("@@")) {
      lines.push(`  HUNK ${line.replace(/^@@\s*/, "").replace(/\s*@@.*$/, "")}`);
    }
  }
  return lines.join("\n").trim();
}

/** One call for the whole-PR narrative, replacing N per-chunk summaries. */
async function generateNarrative(
  input: RunReviewInput,
  diff: string
): Promise<z.infer<typeof narrativeSchema>> {
  const prompt = `You are an expert code reviewer writing the top-level summary of a pull request.

PR Title: ${input.title}
PR Description: ${input.description || "No description provided"}

You are given the STRUCTURE of the diff — every changed file and the line ranges touched, without the code itself:
${buildStructureView(diff)}

Write a concise whole-PR narrative using the JSON schema.
- 'summary': at most 3 sentences on what this PR does overall.
- 'walkthrough': one short line per file, in the form "path — what changed". No preamble, no conclusion.
- 'sequenceDiagram': A valid Mermaid sequence diagram (starting with 'sequenceDiagram' syntax) visualizing the key interaction or execution flow modified by this PR. Keep it concise (3-6 lines). Return empty string only if no logic flows exist in the changed files. Do not include markdown code block backticks in the string.
Do not speculate about bugs — a separate pass handles findings.`;

  try {
    const { object } = await generateObjectWithFallback(prompt, narrativeSchema);
    return object;
  } catch (error) {
    console.error("[engine] Narrative pass failed:", error);
    return { summary: "", walkthrough: "", sequenceDiagram: "" };
  }
}

/**
 * Merges findings that describe the same problem. Chunks are reviewed
 * independently, so a pattern repeated across files was reported once per chunk.
 */
function dedupeFindings(findings: ReviewOutput["findings"]): ReviewOutput["findings"] {
  const seen = new Map<string, ReviewOutput["findings"][number]>();
  for (const f of findings) {
    const key = `${f.file}:${f.startLine}:${f.category}`;
    const prev = seen.get(key);
    // Keep whichever the verifiers were more sure of.
    if (!prev || (parseInt(f.confidence) || 0) > (parseInt(prev.confidence) || 0)) {
      seen.set(key, f);
    }
  }
  return [...seen.values()];
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, nit: 1 };

/**
 * Orders findings and splits off overflow. Everything here has ALREADY passed
 * the majority vote in verifyFindings (2/3 = verified, per D-009), so this must
 * not second-guess that verdict — the vote decides validity, this decides volume
 * only. The collapsed section is for what exceeds the inline cap, nothing else.
 */
export function partitionFindings(
  findings: ReviewOutput["findings"],
  changedLines: number,
  maxInline = 12
): { primary: ReviewOutput["findings"]; secondary: ReviewOutput["findings"] } {
  const ranked = [...findings].sort((a, b) => {
    const sev = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sev !== 0) return sev;
    return (parseInt(b.confidence) || 0) - (parseInt(a.confidence) || 0);
  });

  // On a large PR nits are noise, so they lose their inline slot — but they are
  // still reported in the collapsed section rather than deleted.
  const NIT_FLOOR_LINES = 500;
  const demoteNits = changedLines > NIT_FLOOR_LINES;

  const primary: ReviewOutput["findings"] = [];
  const secondary: ReviewOutput["findings"] = [];
  for (const f of ranked) {
    const eligible = !(demoteNits && f.severity === "nit");
    if (eligible && primary.length < maxInline) primary.push(f);
    else secondary.push(f);
  }

  if (secondary.length > 0) {
    console.log(`[engine] ${primary.length} finding(s) inline, ${secondary.length} collapsed (cap ${maxInline}${demoteNits ? ", nits demoted" : ""}).`);
  }
  return { primary, secondary };
}

export async function runReview(
  input: RunReviewInput
): Promise<RunReviewResult> {
  const startedAt = Date.now();
  
  // 1. Filter out noise files (lockfiles, SVGs, minified bundles) before anything else
  const filteredDiff = filterNoiseFilesFromDiff(input.diff);

  // 2. Chunk the filtered diff
  const diffChunks = chunkDiff(filteredDiff, 12000);
  console.log(`[engine] Diff split into ${diffChunks.length} chunks for processing.`);

  const allInitialFindings: ReviewOutput["findings"] = [];
  const allVerifiedFindings: ReviewOutput["findings"] = [];
  const allChunks: InvestigatedChunk[] = [];
  const strengths: string[] = [];
  let overallRetrievalMode: RetrievalMode = "skipped";
  let totalRetrievedChunks = 0;

  // 2. Process each chunk in parallel
  const reviewModeSetting = input.reviewMode ?? "standard";
  const provider = process.env.AI_PROVIDER ?? "google";

  // The whole-PR narrative comes from ONE structure-scan call, in parallel with
  // the per-chunk finding passes (D-010 Option B).
  const narrativePromise = generateNarrative(input, filteredDiff);

  const chunkPromises = diffChunks.map(async (diffChunk) => {
    const { chunks, mode } = await retrieve({ ...input, diff: diffChunk });
    if (mode === "diff") overallRetrievalMode = "diff";
    if (mode === "fallback" && overallRetrievalMode === "skipped") overallRetrievalMode = "fallback";

    const prompt = buildPrompt({ ...input, diff: diffChunk }, chunks);

    const { object } = await generateObjectWithFallback(prompt, chunkFindingsSchema);

    const rawInitialFindings = JSON.parse(JSON.stringify(object.findings));
    // Verify against THIS chunk, not the whole diff — otherwise chunking is
    // defeated and the verify calls can blow the context limit on a large PR.
    const verifiedFindings = await verifyFindings(
      { ...input, diff: diffChunk },
      chunks,
      object.findings,
      reviewModeSetting
    );
    const groundedFindings = performExistenceChecks(diffChunk, verifiedFindings);

    return {
      object,
      groundedFindings,
      rawInitialFindings,
      retrievedChunks: chunks
    };
  });

  const results = await Promise.all(chunkPromises);
  const narrative = await narrativePromise;

  // 3. Merge results
  for (const res of results) {
    allInitialFindings.push(...res.rawInitialFindings);
    allVerifiedFindings.push(...res.groundedFindings);
    allChunks.push(...res.retrievedChunks);
    if (res.object.strengths) strengths.push(...res.object.strengths);
    totalRetrievedChunks += res.retrievedChunks.length;
  }

  // Deduplicate strengths and retrieved chunks
  const uniqueStrengths = Array.from(new Set(strengths)).slice(0, 5);
  const uniqueChunks = Array.from(new Map(allChunks.map(c => [c.content, c])).values());

  // Chunks are reviewed independently, so the same issue can be reported more
  // than once. Dedupe before anything is posted.
  const dedupedFindings = dedupeFindings(allVerifiedFindings);
  if (dedupedFindings.length !== allVerifiedFindings.length) {
    console.log(`[engine] Deduped ${allVerifiedFindings.length - dedupedFindings.length} duplicate finding(s).`);
  }

  const mergedObject: ReviewOutput = {
    summary: narrative.summary,
    walkthrough: narrative.walkthrough,
    sequenceDiagram: narrative.sequenceDiagram,
    strengths: uniqueStrengths,
    findings: dedupedFindings
  };

  const changedLines = countChangedLines(filteredDiff);
  const markdownOutput = formatReviewAsMarkdown(mergedObject, changedLines);
  
  const latencyMs = Date.now() - startedAt;
  return {
    output: markdownOutput,
    structured: mergedObject,
    latencyMs,
    meta: {
      retrievalMode: overallRetrievalMode,
      chunkCount: totalRetrievedChunks,
      provider,
      changedLines,
    },
    trace: {
      chunks: uniqueChunks,
      initialFindings: allInitialFindings,
      verifiedFindings: allVerifiedFindings
    }
  };
}
