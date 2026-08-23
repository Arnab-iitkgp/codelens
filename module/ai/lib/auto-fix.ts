import prisma from "@/lib/db";
import { Octokit } from "octokit";
import { runAgenticFixer } from "./agent-fixer";

/**
 * Runs the Agentic Fixer for one finding and posts the result as a native
 * GitHub suggestion block.
 *
 * NOTE: this function performs NO authorization — it resolves the repository by
 * (owner, name) and acts with the repo owner's GitHub token. Callers are
 * responsible for authorizing the request first:
 *   - `executeAutoFix()` in `module/ai/actions/fix.ts` checks the user session
 *     and repository ownership before delegating here.
 *   - the GitHub webhook calls this directly, since a webhook has no session.
 * Do not export this from a `"use server"` module — that would expose it as an
 * unauthenticated action endpoint.
 */
export async function runAutoFixAndComment(
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string,
  finding: string,
  startLine: number,
  endLine: number
) {
  try {
    console.log(`[AutoFix] Triggered for ${owner}/${repo} PR #${prNumber} on ${filePath} (L${startLine}-${endLine})`);

    // 1. Get the repository and user token
    const repository = await prisma.repository.findFirst({
      where: { owner, name: repo },
      include: {
        user: {
          include: { accounts: { where: { providerId: "github" } } }
        }
      }
    });

    if (!repository || !repository.user?.accounts?.[0]?.accessToken) {
      throw new Error("Repository or GitHub token not found. Please ensure your GitHub account is linked.");
    }

    const githubToken = repository.user.accounts[0].accessToken;

    // 2. Run the Agent (Thinks, Plans, Acts)
    const agentResult = await runAgenticFixer(
      githubToken,
      owner,
      repo,
      repository.id,
      finding,
      filePath,
      startLine,
      endLine
    );

    if (!agentResult.success || !agentResult.patch) {
      console.error(`[Auto-Fix] ❌ Agent failed to generate a patch. (Model: ${agentResult.modelUsed})`);
      console.error("[Auto-Fix] 🧠 Final Thoughts:\n", agentResult.agentThoughts);
      console.error("[Auto-Fix] 📋 Final Plan:\n", agentResult.plan);
      throw new Error(`Agent failed to generate a patch. (Model: ${agentResult.modelUsed}) Last thoughts: ${agentResult.agentThoughts}`);
    }

    // 3. Post the fix as a native GitHub Suggestion Block!
    const octokit = new Octokit({ auth: githubToken });

    // 3a. An inline comment must be attached to the PR's HEAD commit. Read it from
    // the PR itself — pulls.listCommits is paginated (30/page), so the last entry
    // of page 1 is not the head commit on larger PRs and yields a 422.
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });
    const headCommitSha = pullRequest.head.sha;

    // 3b. Format the body with the suggestion block
    const commentBody = `🤖 **CodeLens Agent (Auto-Fix)**\n\nI analyzed the blast radius and autonomously generated this fix. Click **Commit suggestion** to merge it safely.\n\n\`\`\`suggestion\n${agentResult.patch}\n\`\`\`\n\n<details>\n<summary>Agent Reasoning Log</summary>\n\n${agentResult.plan}\n</details>`;

    // 3c. Post the inline review comment
    await octokit.rest.pulls.createReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      body: commentBody,
      commit_id: headCommitSha,
      path: filePath,
      line: endLine, // GitHub attaches the comment to the last line of the block
      start_line: startLine !== endLine ? startLine : undefined // Only pass start_line if it's a multi-line range
    });

    return { success: true };
  } catch (error) {
    console.error("[AutoFix] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
