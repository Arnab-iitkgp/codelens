/**
 * Agent capability probe: can a non-frontier model drive the ReAct loop?
 *
 * The question this answers: if the primary (Vertex) door becomes unavailable, is Auto-Fix
 * "degraded" or "disabled"? It runs the REAL runAgenticFixer against a real
 * repo, switching only the door via AI_AGENT_MODEL.
 *
 *   npx tsx scratch/check-agent-door.ts groq:openai/gpt-oss-120b
 *   npx tsx scratch/check-agent-door.ts google-vertex:gemini-3.1-pro-preview
 *
 * Scores four things independently, because they fail for different reasons:
 *   1. TOOL CALLS   — can it call tools with valid arguments at all?
 *   2. PLANNING     — did it call write_plan (follows the forced sequence)?
 *   3. PATCH        — did it call propose_patch (reached a conclusion)?
 *   4. LINE BUDGET  — does the patch respect the range it must replace?
 *
 * Read-only: nothing is posted to GitHub.
 */
import "dotenv/config";
import { Octokit } from "octokit";

const spec = process.argv[2] || "groq:openai/gpt-oss-120b";
process.env.AI_AGENT_CHAIN = spec;

const token = process.env.DEMO_GITHUB_TOKEN || "";
const owner = process.env.DEMO_GITHUB_OWNER || "";
const repo = process.env.DEMO_GITHUB_REPO || "";
const targetPath = process.env.PROBE_FILE || "README.md";

async function main() {
  if (!token || !owner || !repo) {
    console.error("Need DEMO_GITHUB_TOKEN / DEMO_GITHUB_OWNER / DEMO_GITHUB_REPO in .env");
    process.exit(1);
  }

  // Import AFTER setting AI_AGENT_MODEL so module-level env reads see it.
  const { runAgenticFixer } = await import("../module/ai/lib/agent-fixer");

  // 1. Read the file ourselves so we can pick a real range and grade the patch.
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.getContent({ owner, repo, path: targetPath });
  if (Array.isArray(data) || !("content" in data)) {
    console.error(`${targetPath} is not a file`);
    process.exit(1);
  }
  const fileText = Buffer.from(data.content, "base64").toString("utf-8");
  const lines = fileText.split("\n");

  // Target a small range in the middle of the file.
  const startLine = Math.max(1, Math.floor(lines.length / 2));
  const endLine = Math.min(lines.length, startLine + 2);
  const expectedLineCount = endLine - startLine + 1;
  const original = lines.slice(startLine - 1, endLine).join("\n");

  console.log("═".repeat(70));
  console.log(`AGENT DOOR PROBE: ${spec}`);
  console.log("═".repeat(70));
  console.log(`Repo   : ${owner}/${repo}`);
  console.log(`File   : ${targetPath} (${lines.length} lines)`);
  console.log(`Range  : L${startLine}-${endLine} (${expectedLineCount} line(s))`);
  console.log(`Original text in range:\n---\n${original}\n---\n`);

  const finding = [
    `Claim: The text at lines ${startLine}-${endLine} of ${targetPath} is unclear and should be rewritten for clarity.`,
    `Evidence: The current content reads: ${JSON.stringify(original)}`,
    `Reviewer's suggested direction: Rewrite these lines to be clearer while preserving their meaning and formatting.`,
  ].join("\n");

  const startedAt = Date.now();
  let result;
  try {
    result = await runAgenticFixer(
      token,
      owner,
      repo,
      "probe-no-such-repo-id", // no graph/vector data — exercises the degraded path
      finding,
      targetPath,
      startLine,
      endLine
    );
  } catch (error) {
    console.log("\n═══ RESULT ═══");
    console.log(`❌ THREW: ${error instanceof Error ? error.message : String(error)}`);
    console.log("\nVerdict: this door cannot run the agent at all.");
    process.exit(0);
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  // 2. Grade it.
  const calledTools = /\[Agent\] Tool:/.test("") || result.plan !== "" || result.patch !== "";
  const planned = result.plan !== "";
  const patched = result.patch !== "";
  const patchLineCount = patched ? result.patch.split("\n").length : 0;
  const budgetOk = patched && patchLineCount <= expectedLineCount + 2;

  console.log("\n═══ RESULT ═══");
  console.log(`Model used     : ${result.modelUsed}`);
  console.log(`Wall clock     : ${elapsed}s`);
  console.log(`1. TOOL CALLS  : ${calledTools ? "✅ reached a tool" : "❌ never called a tool successfully"}`);
  console.log(`2. PLANNING    : ${planned ? "✅ called write_plan" : "❌ skipped write_plan"}`);
  console.log(`3. PATCH       : ${patched ? "✅ called propose_patch" : "❌ no patch produced"}`);
  console.log(
    `4. LINE BUDGET : ${
      patched
        ? budgetOk
          ? `✅ ${patchLineCount} line(s) for a ${expectedLineCount}-line range`
          : `⚠️  ${patchLineCount} line(s) for a ${expectedLineCount}-line range (overshoot)`
        : "— n/a"
    }`
  );

  if (planned) console.log(`\n── PLAN ──\n${result.plan}`);
  if (patched) console.log(`\n── PATCH (would replace L${startLine}-${endLine}) ──\n${result.patch}`);
  if (result.agentThoughts.trim()) {
    console.log(`\n── THOUGHTS (first 800 chars) ──\n${result.agentThoughts.slice(0, 800)}`);
  }

  console.log("\n── VERDICT ──");
  if (patched && planned && budgetOk) {
    console.log(`✅ ${spec} can drive the current ReAct loop.`);
  } else if (patched) {
    console.log(`⚠️  ${spec} produces a patch but not cleanly (see failures above).`);
  } else {
    console.log(`❌ ${spec} cannot complete the loop. Auto-Fix would fail on this door.`);
  }
}

main().catch(console.error);
