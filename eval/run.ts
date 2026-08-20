import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { loadAllCases } from "./lib/cases";
import { runReview } from "@/module/review/lib/engine";
import type { CaseResult } from "./lib/types";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  let cases = loadAllCases();
  if (cases.length === 0) {
    console.error("No cases found in eval/cases/. Add one and try again.");
    process.exit(1);
  }
  
  // Limit to 5 PRs to avoid blowing up free-tier LLM API quotas
  cases = cases.slice(0, 5);

  const provider = process.env.AI_PROVIDER ?? "google";
  const runDir = path.join(
    process.cwd(),
    "eval",
    "results",
    `${timestamp()}-${provider}`
  );
  mkdirSync(runDir, { recursive: true });

  console.log(
    `\nRunning ${cases.length} case(s) with provider=${provider}\nOutput: ${runDir}\n`
  );

  const records: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`- ${c.meta.id}: running… `);
    try {
      const result = await runReview({
        diff: c.diff,
        title: c.meta.title,
        description: c.meta.description,
        repoId: `eval:${c.meta.id}`,
        options: { skipRetrieval: true },
      });
      const record: CaseResult = {
        caseId: c.meta.id,
        output: result.output,
        latencyMs: result.latencyMs,
        meta: result.meta,
        timestamp: new Date().toISOString(),
      };
      records.push(record);
      writeFileSync(path.join(runDir, `${c.meta.id}.output.md`), result.output);
      writeFileSync(
        path.join(runDir, `${c.meta.id}.meta.json`),
        JSON.stringify(record, (k, v) => (k === "output" ? undefined : v), 2)
      );
      console.log(
        `✓ ${result.latencyMs}ms (retrieval=${result.meta.retrievalMode}, chunks=${result.meta.chunkCount})`
      );
    } catch (err) {
      console.log(`✗ failed`);
      console.error(`   ${(err as Error)?.message ?? err}`);
    }
    
    // Add a 12-second delay to avoid blowing past Groq's 8,000 TPM limit
    await new Promise((resolve) => setTimeout(resolve, 12000));
  }

  writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify(records, null, 2)
  );
  console.log(
    `\nDone. ${records.length}/${cases.length} succeeded.\nRun \`bun eval:judge\` to score.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
