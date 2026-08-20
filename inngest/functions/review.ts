import { inngest } from "../client";
import prisma from "@/lib/db";
import {
  getPullRequestDiff,
  postReviewComment,
  postInlineReview
} from "@/module/github/lib/github";
import { runReview } from "@/module/review/lib/engine";

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

    // Retrieve + generate happen inside runReview so both Inngest (here) and
    // the eval harness call the exact same pipeline. The two used to be
    // separate step.run() blocks — merged into one for eval parity. If
    // per-substep durability becomes valuable later, split back out.
    const review = await step.run("run-review-engine", async () => {
      const { output, structured, latencyMs, meta } = await runReview({
        diff,
        title,
        description,
        repoId: `${owner}/${repo}`,
      });
      console.log(
        `[review] engine done: ${latencyMs}ms, retrieval=${meta.retrievalMode}, chunks=${meta.chunkCount}, provider=${meta.provider}`
      );
      return { output, structured };
    });

    await step.run("post-comment", async () => {
      await postInlineReview(token, owner, repo, prNumber, review.structured, review.output);
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
      if (repository) {
        console.log("Storing review in database for PR #" + prNumber);
        await prisma.review.create({
          data: {
            repositoryId: repository.id,
            prNumber,
            prTitle: title,
            prurl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: review.output,
            status: "completed",
          },
        });
      }
    });
    return { success: true };
  }
);
