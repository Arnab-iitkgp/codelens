import { inngest } from "../client";
import prisma from "@/lib/db";
import {
  getPullRequestDiff,
  postReviewComment,
} from "@/module/github/lib/github";
import { getLanguageModel, generateTextWithFallback } from "@/module/ai/lib/models";
import { retrieveContext, retrieveContextForDiff, type RetrievedChunk } from "@/module/ai/lib/rag";

export const generateReview = inngest.createFunction(
  {
    id: "generate-review",
    triggers: [{ event: "pr.review.requested" }],
    // prevent duplicate procssing of the same webhook event
    idempotency: "event.id",
    // If a new review is requested for the same pr, cancel the cur running one
    cancelOn: [
      {
        event: "pr.review.requested",
        match: "data.prNumber",
      },
    ],
  },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data;
    const { diff, title, description, token } = await step.run(
      "fetch-pr-diff",
      async () => {
        const account = await prisma.account.findFirst({
          where: {
            userId,
            providerId: "github",
          },
        });
        if (!account?.accessToken) {
          throw new Error("No Github access token found");
        }

        const data = await getPullRequestDiff(
          account.accessToken,
          owner,
          repo,
          prNumber
        );
        return {
          ...data,
          token: account.accessToken,
        };
      }
    );

    //retrieve context — diff-driven, per-hunk; fall back to title+description
    // if the diff yields nothing embeddable (empty PR, binary-only, etc.).
    const context = await step.run("retrieve-context", async () => {
      const repoId = `${owner}/${repo}`;
      const chunks = await retrieveContextForDiff(diff, repoId);
      if (chunks.length > 0) {
        console.log(`[review] diff-driven retrieval hit: ${chunks.length} chunks`);
        return { mode: "diff" as const, chunks };
      }
      console.log(`[review] diff yielded no hunks, falling back to title/desc query`);
      const fallback= (await retrieveContext(`${title}\n${description}`, repoId)) ?? [];
      const chunksFromFallback: RetrievedChunk[] = fallback.map((content) => ({
        path: "(unknown)",
        content,
        score: 0,
      }));
      return { mode: "fallback" as const, chunks: chunksFromFallback };
    });

    // Format context as labeled snippets so the model can cite the source file.
    const contextBlock =
      context.chunks.length === 0
        ? "(no relevant context retrieved from the codebase index)"
        : context.chunks
            .map(
              (c) =>
                `### ${c.path}${c.score ? ` (relevance ${c.score.toFixed(2)})` : ""}\n${c.content}`
            )
            .join("\n\n");

    //generate review
    const review = await step.run("generate-ai-review", async () => {
      const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.

PR Title: ${title}
PR Description: ${description || "No description provided"}

Context from Codebase (retrieved per-hunk from the diff; each snippet is labeled with its file path):
${contextBlock}

Code Changes:
\`\`\`diff
${diff}
\`\`\`

Please provide:
1. **Walkthrough**: A file-by-file explanation of the changes.keep it short, concise and to the point.
2. **Sequence Diagram**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. **IMPORTANT**: Ensure the Mermaid syntax is valid. Do not use special characters (like quotes, braces, parentheses) inside Note text or labels as it breaks rendering. Keep the diagram simple.
3. **Summary**: Brief overview.
4. **Strengths**: What's done well.
5. **Issues**: Bugs, security concerns, code smells.
6. **Suggestions**: Specific code improvements.

Format your response in markdown.`;

      const { text } = await generateTextWithFallback(prompt);
      return text;
    });
    await step.run("post -comment", async () => {
      await postReviewComment(token, owner, repo, prNumber, review);
    });

    //store review in db
    await step.run("store-review-db", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error(`Repository ${owner}/${repo} not found in DB`);
      }
      if(repository){
            console.log( "Storing review in database for PR #"+prNumber);
                await prisma.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prurl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review,
            status: "completed",
          },
        });
      }
    });
    return { success: true };
  }
);
