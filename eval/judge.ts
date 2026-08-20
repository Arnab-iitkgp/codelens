import "dotenv/config";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "fs";
import path from "path";
import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/module/ai/lib/models";
import { loadCase } from "./lib/cases";
import type {
  CaseResult,
  ExpectedFinding,
  JudgedCase,
  JudgedFinding,
} from "./lib/types";

const RESULTS_ROOT = path.join(process.cwd(), "eval", "results");

function findLatestRunDir(): string | null {
  if (!existsSync(RESULTS_ROOT)) return null;
  const dirs = readdirSync(RESULTS_ROOT).filter((d) => !d.startsWith("."));
  if (dirs.length === 0) return null;
  dirs.sort();
  return path.join(RESULTS_ROOT, dirs[dirs.length - 1]);
}

const JudgeSchema = z.object({
  mentioned: z.boolean(),
  evidence: z.string(),
});


async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const INTER_CALL_DELAY_MS = Number(process.env.EVAL_JUDGE_DELAY_MS ?? 13000);
const MAX_ATTEMPTS = 4;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const errBody = JSON.stringify(
        (err as { responseBody?: string })?.responseBody ?? ""
      );
      const msg = String((err as Error)?.message ?? err) + " " + errBody;
      const lower = msg.toLowerCase();

      // Daily quota is not retry-fixable — bail with a clear message so the
      // user isn't buried in a wall of stack trace.
      if (
        lower.includes("perdayperproject") ||
        lower.includes("requestsperdayper")
      ) {
        throw new Error(
          "Daily quota exhausted on the current provider. Options: (1) wait until reset, (2) re-run with AI_PROVIDER=groq or AI_PROVIDER=openai, (3) run against a specific results dir once quota returns: `bun eval:judge eval/results/<dir>`."
        );
      }

      const isRateLimit =
        msg.includes("429") ||
        lower.includes("resource_exhausted") ||
        lower.includes("quota");
      if (!isRateLimit || attempt === MAX_ATTEMPTS - 1) throw err;
      const retryHint = msg.match(/retry in ([\d.]+)s/i);
      const delayMs = retryHint
        ? Math.ceil(parseFloat(retryHint[1]) * 1000) + 500
        : Math.min(30000, 2000 * 2 ** attempt);
      console.log(`    (rate-limited, sleeping ${delayMs}ms then retrying…)`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

async function judgeOne(
  expected: ExpectedFinding,
  output: string
): Promise<{ mentioned: boolean; evidence: string }> {
  const prompt = `You are grading whether a code review mentioned a specific issue.

EXPECTED ISSUE
- File: ${expected.file}
- Line: ${expected.line ?? "(unspecified)"}
- Kind: ${expected.kind}
- Description: ${expected.description}

REVIEW OUTPUT
"""
${output}
"""

TASK
Decide whether the review output identifies the same issue described above.
- Paraphrase counts; exact wording is not required.
- If mentioned, quote the exact passage in the review that mentions it (verbatim, no paraphrase) in the "evidence" field.
- If not mentioned, set mentioned=false and evidence="".
- If you set mentioned=true but cannot find a verbatim quote, set mentioned=false.`;

  const { object } = await withRetry(() =>
    generateObject({
      model: getLanguageModel(),
      schema: JudgeSchema,
      prompt,
    })
  );

  if (
    object.mentioned &&
    (!object.evidence || object.evidence.trim().length === 0)
  ) {
    return { mentioned: false, evidence: "" };
  }
  return object;
}

function renderReport(runDirName: string, judged: JudgedCase[]): string {
  const overall =
    judged.length === 0
      ? 0
      : judged.reduce((s, j) => s + j.recall, 0) / judged.length;
  const lines: string[] = [];
  lines.push(`# Eval Report`);
  lines.push(``);
  lines.push(
    `Run: \`${runDirName}\`  ·  Cases: ${judged.length}  ·  **Overall recall: ${(overall * 100).toFixed(0)}%**`
  );
  lines.push(``);
  lines.push(
    `> Retrieval is stubbed (\`skipRetrieval: true\`) in this v1 harness — Phase 0.5 measures the review-generation pipeline only. Retrieval quality will be measured once indexed eval repos are added (deferred to Phase 3).`
  );
  lines.push(``);
  lines.push(`## Per-case`);
  lines.push(``);
  lines.push(`| Case | Provider | Expected | Mentioned | Recall |`);
  lines.push(`|---|---|---|---|---|`);
  for (const j of judged) {
    const mentioned = j.findings.filter((f) => f.mentioned).length;
    lines.push(
      `| ${j.caseId} | ${j.provider} | ${j.findings.length} | ${mentioned} | ${(j.recall * 100).toFixed(0)}% |`
    );
  }
  lines.push(``);
  lines.push(`## Details`);
  lines.push(``);
  for (const j of judged) {
    lines.push(`### ${j.caseId}`);
    lines.push(``);
    j.findings.forEach((f, i) => {
      lines.push(
        `**${i + 1}. [${f.kind}] ${f.file}${f.line ? `:${f.line}` : ""}** — ${f.description}`
      );
      lines.push(`  - mentioned: ${f.mentioned ? "✓" : "✗"}`);
      if (f.mentioned && f.evidence) {
        const oneLine = f.evidence.replace(/\s+/g, " ").trim();
        lines.push(`  - evidence: > ${oneLine}`);
      }
      lines.push(``);
    });
  }
  return lines.join("\n");
}

async function main() {
  const runDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : findLatestRunDir();
  if (!runDir) {
    console.error(
      "No run directory found. Run `bun eval:run` first, or pass a path."
    );
    process.exit(1);
  }
  console.log(`Judging: ${runDir}`);

  const outputsPath = path.join(runDir, "run.json");
  if (!existsSync(outputsPath)) {
    console.error(`Missing ${outputsPath}. Cannot judge.`);
    process.exit(1);
  }
  const records = JSON.parse(readFileSync(outputsPath, "utf-8")) as CaseResult[];

  const judged: JudgedCase[] = [];
  let callCount = 0;
  for (const record of records) {
    const c = loadCase(record.caseId);
    console.log(
      `- ${record.caseId}: judging ${c.groundTruth.findings.length} finding(s)…`
    );
    const findings: JudgedFinding[] = [];
    for (const expected of c.groundTruth.findings) {
      if (callCount > 0) await sleep(INTER_CALL_DELAY_MS);
      callCount++;
      const j = await judgeOne(expected, record.output);
      findings.push({ ...expected, ...j });
    }
    const mentioned = findings.filter((f) => f.mentioned).length;
    const recall = findings.length === 0 ? 1 : mentioned / findings.length;
    judged.push({
      caseId: record.caseId,
      provider: record.meta.provider,
      findings,
      recall,
    });
    console.log(
      `  ✓ recall ${mentioned}/${findings.length} = ${(recall * 100).toFixed(0)}%`
    );
  }

  writeFileSync(
    path.join(runDir, "judged.json"),
    JSON.stringify(judged, null, 2)
  );
  const report = renderReport(path.basename(runDir), judged);
  writeFileSync(path.join(runDir, "report.md"), report);

  const overall =
    judged.length === 0
      ? 0
      : judged.reduce((s, j) => s + j.recall, 0) / judged.length;
  console.log(
    `\n✓ Judged. Overall recall: ${(overall * 100).toFixed(0)}%\n  Report: ${path.join(runDir, "report.md")}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
