import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { indexRepo } from "../../../inngest/functions/index";
import { generateReview } from "@/inngest/functions/review";
import { generateDemoReview } from "@/inngest/functions/demo-review";
import { generateProfile } from "@/inngest/functions/profile";
import { generateAutoFix } from "@/inngest/functions/auto-fix";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    /* your functions will be passed here later! */
    indexRepo,
    generateReview,
    generateDemoReview,
    generateProfile,
    generateAutoFix,
  ],
});