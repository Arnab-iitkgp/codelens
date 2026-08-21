import { inngest } from "../client";
import prisma from "@/lib/db";
import { getLanguageModel, generateTextWithFallback } from "@/module/ai/lib/models";
import { Octokit } from "octokit";
import { retrieveContext } from "@/module/ai/lib/rag";

const DEMO_BRANCH_PREFIX = "demo-review-";

export const generateDemoReview = inngest.createFunction(
  { 
    id: "generate-demo-review",
    triggers: [{ event: "demo.review.requested" }],
    // Handle idempotency for duplicate demo triggers
    idempotency: "event.id",
    // Cancel any existing demo reviews if a new one is started for the same ID
    cancelOn: [
      {
        event: "demo.review.requested",
        match: "data.demoReviewId",
      },
    ],
  },
  async ({ event, step }) => {
    const { demoReviewId, files } = event.data as {
      demoReviewId: string;
      files: Array<{ path: string; content: string }>;
    };

    const token = process.env.DEMO_GITHUB_TOKEN!;
    const owner = process.env.DEMO_GITHUB_OWNER!;
    const repo = process.env.DEMO_GITHUB_REPO!;

    // Step 1: Create a branch and commit all modified files using Git Tree API
    const { prNumber, prUrl } = await step.run(
      "create-demo-pr",
      async () => {
        const octokit = new Octokit({ auth: token });

        // Get default branch and its latest commit SHA
        const { data: repoData } = await octokit.rest.repos.get({
          owner,
          repo,
        });
        const defaultBranch = repoData.default_branch;

        const { data: refData } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${defaultBranch}`,
        });
        const baseCommitSha = refData.object.sha;

        // Get the base tree SHA from the latest commit
        const { data: commitData } = await octokit.rest.git.getCommit({
          owner,
          repo,
          commit_sha: baseCommitSha,
        });
        const baseTreeSha = commitData.tree.sha;

        // Create blobs for each modified file
        const treeItems: Array<{
          path: string;
          mode: "100644";
          type: "blob";
          sha: string;
        }> = [];

        for (const file of files) {
          const { data: blob } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: Buffer.from(file.content).toString("base64"),
            encoding: "base64",
          });
          treeItems.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          });
        }

        // Create a new tree with the modified files
        const { data: newTree } = await octokit.rest.git.createTree({
          owner,
          repo,
          base_tree: baseTreeSha,
          tree: treeItems,
        });

        // Create a commit pointing to the new tree
        const changedFileNames = files.map((f) => f.path).join(", ");
        const { data: newCommit } = await octokit.rest.git.createCommit({
          owner,
          repo,
          message: `Demo: Modified ${changedFileNames}`,
          tree: newTree.sha,
          parents: [baseCommitSha],
        });

        // Create the branch pointing to the new commit
        const branchName = `${DEMO_BRANCH_PREFIX}${demoReviewId}`;
        await octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: newCommit.sha,
        });

        // Create PR
        const { data: pr } = await octokit.rest.pulls.create({
          owner,
          repo,
          title: `[Demo] Code changes across ${files.length} file(s)`,
          body: `This PR was automatically created by a CodeLens demo user.\n\n**Modified files:** ${changedFileNames}`,
          head: branchName,
          base: defaultBranch,
        });

        return { prNumber: pr.number, prUrl: pr.html_url };
      }
    );

    // Update the demo review with PR info
    await step.run("update-pr-info", async () => {
      await prisma.demoReview.update({
        where: { id: demoReviewId },
        data: {
          prNumber,
          prUrl,
          status: "reviewing",
          currentStep: "Fetching codebase context via RAG",
        },
      });
    });

    // Step 2: Fetch the diff
    const diff = await step.run("fetch-demo-diff", async () => {
      const octokit = new Octokit({ auth: token });
      const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      });
      return data as unknown as string;
    });

    // Step 3: Retrieve RAG context from indexed codebase
    const context = await step.run("retrieve-demo-context", async () => {
      const repoId = `${owner}/${repo}`;
      const query = `[Demo] Code changes across ${files.length} file(s)\n${files.map(f => f.path).join(", ")}`;
      const results = await retrieveContext(query, repoId);
      
      await prisma.demoReview.update({
        where: { id: demoReviewId },
        data: {
          currentStep: "Analyzing code changes with Gemini AI",
        },
      });
      
      return results;
    });

    // Step 4: Generate AI review with codebase context
    const review = await step.run("generate-demo-ai-review", async () => {
      const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.

PR Title: [Demo] Code changes across ${files.length} file(s)
PR Description: This code was submitted by a user trying out CodeLens.

Context from Codebase:
${context.join("\n\n")}

Code Changes (unified diff):
\`\`\`diff
${diff}
\`\`\`

Please provide:
1. **Walkthrough**: A file-by-file explanation of the changes. Keep it short, concise and to the point.
2. **Sequence Diagram**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. **IMPORTANT**: Ensure the Mermaid syntax is strictly valid. Do not use quotes around participant names. For notes, you MUST use 'Note over [Participant]:' or 'Note right of [Participant]:'. Never use 'note [Participant]' without a position. Keep it simple.
3. **Summary**: Brief overview.
4. **Strengths**: What's done well.
5. **Issues**: Bugs, security concerns, code smells.
6. **Suggestions**: Specific code improvements.

Format your response in markdown.`;

      const { text } = await generateTextWithFallback(prompt);
      return text;
    });

    // Step 4: Post review as PR comment
    await step.run("update-progress-posting", async () => {
      await prisma.demoReview.update({
        where: { id: demoReviewId },
        data: {
          currentStep: "Posting review on Pull Request",
        },
      });
    });

    await step.run("post-demo-comment", async () => {
      const octokit = new Octokit({ auth: token });
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `## Automated Code Review\n\n${review}\n\n*This review was generated automatically by CodeLens Demo.*`,
      });
    });

    // Step 5: Store the review
    await step.run("store-demo-review", async () => {
      await prisma.demoReview.update({
        where: { id: demoReviewId },
        data: {
          review,
          status: "completed",
          currentStep: "Done",
        },
      });
    });

    // Step 6: Wait before cleanup so the user can view the link
    await step.sleep("wait-before-cleanup", "2h");

    // Step 7: Close the PR and delete the branch (cleanup)
    await step.run("cleanup-demo-pr", async () => {
      const octokit = new Octokit({ auth: token });
      const branchName = `${DEMO_BRANCH_PREFIX}${demoReviewId}`;

      // Close the PR
      try {
        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: prNumber,
          state: "closed",
        });
      } catch (e) {
        console.error("Failed to close demo PR:", e);
      }

      // Delete the branch
      try {
        await octokit.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
        });
      } catch (e) {
        console.error("Failed to delete demo branch:", e);
      }
    });

    return { success: true, demoReviewId };
  }
);
