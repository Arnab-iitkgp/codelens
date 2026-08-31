import { inngest } from "../client";
import prisma from "@/lib/db";
import { runAutoFixAndComment } from "@/module/ai/lib/auto-fix";

export const generateDemoFix = inngest.createFunction(
  {
    id: "generate-demo-fix",
    triggers: [{ event: "demo.fix.requested" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { demoReviewId, findingId, filePath, startLine, endLine, findingText } = event.data as {
      demoReviewId: string;
      findingId: string;
      filePath: string;
      startLine: number;
      endLine: number;
      findingText: string;
    };

    const owner = process.env.DEMO_GITHUB_OWNER!;
    const repo = process.env.DEMO_GITHUB_REPO!;

    const demoReview = await step.run("fetch-demo-review", async () => {
      const review = await prisma.demoReview.findUnique({
        where: { id: demoReviewId },
      });
      if (!review) throw new Error("Demo review not found");
      if (!review.prNumber) throw new Error("Demo PR number not available");
      return review;
    });

    await step.run("run-demo-autofix", async () => {
      const result = await runAutoFixAndComment(
        owner,
        repo,
        demoReview.prNumber!,
        filePath,
        findingText,
        startLine,
        endLine,
        "review" // Force Flash model chain for demo playground
      );

      // Update structured JSON in DemoReview to reflect fix status
      const existingStructured = (demoReview.structured as any) || {};
      const updatedFixes = {
        ...(existingStructured.fixes || {}),
        [findingId]: {
          status: result.success ? "done" : "failed",
          error: result.error,
          patch: result.finalPatch,
          plan: result.agentResult?.plan,
          thoughts: result.agentResult?.agentThoughts,
          updatedAt: new Date().toISOString(),
        },
      };

      await prisma.demoReview.update({
        where: { id: demoReviewId },
        data: {
          structured: {
            ...existingStructured,
            fixes: updatedFixes,
          },
        },
      });

      if (!result.success) {
        throw new Error(`Demo Auto-Fix failed: ${result.error}`);
      }

      return result;
    });

    return { success: true };
  }
);
