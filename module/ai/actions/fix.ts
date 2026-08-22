"use server";

import prisma from "@/lib/db";
import { runAgenticFixer } from "../lib/agent-fixer";
import { Octokit } from "octokit";

export async function executeAutoFix(
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
      filePath
    );

    if (!agentResult.success || !agentResult.patch) {
      throw new Error("Agent failed to generate a patch.");
    }

    // 3. Post the fix as a native GitHub Suggestion Block!
    const octokit = new Octokit({ auth: githubToken });
    
    // 3a. We need the latest commit SHA on the PR to attach an inline comment
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber
    });
    const latestCommitSha = commits[commits.length - 1].sha;

    // 3b. Format the body with the suggestion block
    const commentBody = `🤖 **CodeLens Agent (Auto-Fix)**\n\nI analyzed the blast radius and autonomously generated this fix. Click **Commit suggestion** to merge it safely.\n\n\`\`\`suggestion\n${agentResult.patch}\n\`\`\`\n\n<details>\n<summary>Agent Reasoning Log</summary>\n\n${agentResult.plan}\n</details>`;

    // 3c. Post the inline review comment
    await octokit.rest.pulls.createReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      body: commentBody,
      commit_id: latestCommitSha,
      path: filePath,
      line: endLine, // GitHub attaches the comment to the last line of the block
      start_line: startLine !== endLine ? startLine : undefined // Only pass start_line if it's a multi-line range
    });

    return { success: true };
  } catch (error: any) {
    console.error("[AutoFix] Error:", error);
    return { success: false, error: error.message };
  }
}
