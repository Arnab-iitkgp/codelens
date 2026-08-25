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
/**
 * Trims untouched leading and trailing context lines from an agent's patch snippet
 * by comparing it against the original file content at lines [startLine..endLine].
 */
export function trimPatchToDelta(
  originalFileContent: string,
  patchSnippet: string,
  startLine: number,
  endLine: number
): { patch: string; startLine: number; endLine: number } {
  if (!originalFileContent || !patchSnippet || startLine > endLine) {
    return { patch: patchSnippet, startLine, endLine };
  }

  const originalLines = originalFileContent.split("\n");
  const patchLines = patchSnippet.split("\n");
  const targetOriginalLines = originalLines.slice(startLine - 1, endLine);

  let curStart = startLine;
  let curEnd = endLine;

  // Trim leading matching lines
  while (
    patchLines.length > 1 &&
    targetOriginalLines.length > 0 &&
    patchLines[0] === targetOriginalLines[0]
  ) {
    patchLines.shift();
    targetOriginalLines.shift();
    curStart++;
  }

  // Trim trailing matching lines
  while (
    patchLines.length > 1 &&
    targetOriginalLines.length > 0 &&
    patchLines[patchLines.length - 1] === targetOriginalLines[targetOriginalLines.length - 1]
  ) {
    patchLines.pop();
    targetOriginalLines.pop();
    curEnd--;
  }

  return {
    patch: patchLines.join("\n"),
    startLine: curStart,
    endLine: curEnd,
  };
}

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
    const octokit = new Octokit({ auth: githubToken });

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

    // 3. Get the PR head commit SHA for exact file revision and comment posting
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });
    const headCommitSha = pullRequest.head.sha;

    // 4. Fetch original file content AT THE EXACT PR REVISION to trim untouched context lines
    let finalPatch = agentResult.patch;
    let finalStartLine = startLine;
    let finalEndLine = endLine;

    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: headCommitSha
      });
      if (!Array.isArray(fileData) && 'content' in fileData) {
        const rawContent = Buffer.from(fileData.content, "base64").toString("utf-8");
        const trimmed = trimPatchToDelta(rawContent, agentResult.patch, startLine, endLine);
        finalPatch = trimmed.patch;
        finalStartLine = trimmed.startLine;
        finalEndLine = trimmed.endLine;
        if (finalStartLine !== startLine || finalEndLine !== endLine) {
          console.log(`[Auto-Fix] Trimmed patch range from L${startLine}-${endLine} -> L${finalStartLine}-${finalEndLine}`);
        }
      }
    } catch (contentErr) {
      console.warn("[Auto-Fix] Failed to fetch file content for trimming, using raw patch:", contentErr);
    }

    // 5. Post the fix as a native GitHub Suggestion Block!
    const commentBody = `🤖 **CodeLens Agent (Auto-Fix)**\n\nI analyzed the blast radius and autonomously generated this fix. Click **Commit suggestion** to merge it safely.\n\n\`\`\`suggestion\n${finalPatch}\n\`\`\`\n\n<details>\n<summary>Agent Reasoning Log</summary>\n\n${agentResult.plan}\n</details>`;

    await octokit.rest.pulls.createReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      body: commentBody,
      commit_id: headCommitSha,
      path: filePath,
      line: finalEndLine,
      start_line: finalStartLine !== finalEndLine ? finalStartLine : undefined
    });

    return { success: true };
  } catch (error) {
    console.error("[AutoFix] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
