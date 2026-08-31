import { inngest } from "../client";
import { runAutoFixAndComment } from "@/module/ai/lib/auto-fix";

export const generateAutoFix = inngest.createFunction(
  {
    id: "generate-auto-fix",
    triggers: [{ event: "pr.auto_fix.requested" }],
    // Retry up to 2 times on transient failures
    retries: 2,
  },
  async ({ event, step }) => {
    const { owner, repo, prNumber, filePath, findingText, targetStartLine, targetEndLine, replyToCommentId } = event.data;
    
    await step.run("run-autofix-agent", async () => {
        const result = await runAutoFixAndComment(
            owner, 
            repo, 
            prNumber, 
            filePath, 
            findingText, 
            targetStartLine, 
            targetEndLine,
            "agent",
            replyToCommentId
        );

        if (!result.success) {
            throw new Error(`Auto-Fix failed: ${result.error}`);
        }

        return result;
    });

    return { success: true };
  }
);
