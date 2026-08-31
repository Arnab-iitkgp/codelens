import prisma from "@/lib/db";
import { Octokit } from "octokit";
import { runAgenticFixer } from "./agent-fixer";
import type { Role } from "./models";

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
  endLine: number,
  chainRole: Role = "agent",
  replyToCommentId?: number
) {
  try {
    console.log(`[AutoFix] Triggered for ${owner}/${repo} PR #${prNumber} on ${filePath} (L${startLine}-${endLine}) using role "${chainRole}"`);

    // 1. Get the repository and user token (or fallback to DEMO token for playground)
    let githubToken = "";
    let repoId = `${owner}/${repo}`;

    const demoOwner = process.env.DEMO_GITHUB_OWNER;
    const demoRepo = process.env.DEMO_GITHUB_REPO;

    if (demoOwner && demoRepo && owner === demoOwner && repo === demoRepo) {
      githubToken = process.env.DEMO_GITHUB_TOKEN || "";
    } else {
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

      githubToken = repository.user.accounts[0].accessToken;
      repoId = repository.id;
    }

    if (!githubToken) {
      throw new Error("No GitHub token available for Auto-Fix execution.");
    }

    const octokit = new Octokit({ auth: githubToken });

    // 2. Run the Agent (Thinks, Plans, Acts)
    const agentResult = await runAgenticFixer(
      githubToken,
      owner,
      repo,
      repoId,
      finding,
      filePath,
      startLine,
      endLine,
      chainRole
    );

    if (!agentResult.success || !agentResult.patch) {
      console.error(`[Auto-Fix] ❌ Agent failed to generate a patch. (Model: ${agentResult.modelUsed})`);
      console.error("[Auto-Fix] 🧠 Final Thoughts:\n", agentResult.agentThoughts);
      console.error("[Auto-Fix] 📋 Final Plan:\n", agentResult.plan);
      throw new Error(`Agent failed to generate a patch. (Model: ${agentResult.modelUsed}) Last thoughts: ${agentResult.agentThoughts}`);
    }

    // 3. Fetch original file content to trim untouched context lines from patch
    let finalPatch = agentResult.patch;
    let finalStartLine = startLine;
    let finalEndLine = endLine;

    try {
      const { data: fileData } = await octokit.rest.repos.getContent({ owner, repo, path: filePath });
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

    // 4. Post the fix as a native GitHub Suggestion Block!
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });
    const headCommitSha = pullRequest.head.sha;

    const commentBody = `🤖 **CodeLens Agent (Auto-Fix)**\n\nI analyzed the blast radius and autonomously generated this fix. Click **Commit suggestion** to merge it safely.\n\n\`\`\`suggestion\n${finalPatch}\n\`\`\`\n\n<details>\n<summary>Agent Reasoning Log</summary>\n\n${agentResult.plan}\n</details>`;

    try {
      if (replyToCommentId) {
        await octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          comment_id: replyToCommentId,
          body: commentBody,
        });
      } else {
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
      }
    } catch (reviewErr: any) {
      if (reviewErr.status === 422) {
        console.warn("[Auto-Fix] ⚠️ GitHub rejected inline comment (422) because the line is outside the PR diff. Falling back to general PR comment.");
        const fallbackBody = `🤖 **CodeLens Agent (Auto-Fix)**\n\nI generated a fix for \`${filePath}\` (L${finalStartLine}-L${finalEndLine}), but GitHub prevents inline suggestions on unmodified lines. Here is the suggested fix:\n\n\`\`\`${filePath}\n${finalPatch}\n\`\`\`\n\n<details>\n<summary>Agent Reasoning Log</summary>\n\n${agentResult.plan}\n</details>`;
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: fallbackBody,
        });
      } else {
        throw reviewErr;
      }
    }

    return { success: true, agentResult, finalPatch, finalStartLine, finalEndLine };
  } catch (error) {
    console.error("[AutoFix] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
