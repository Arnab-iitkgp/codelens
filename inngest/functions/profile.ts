import { inngest } from "../client";
import prisma from "@/lib/db";
import { getRepoSampleFiles } from "@/module/github/lib/github";
import { generateArchitectureProfile } from "@/module/review/lib/profile";

export const generateProfile = inngest.createFunction(
  {
    id: "generate-repo-profile",
    triggers: [{ event: "repo.profile.requested" }],
  },
  async ({ event, step }) => {
    const { owner, repo, userId } = event.data;

    const { files } = await step.run("fetch-sample-files", async () => {
      const account = await prisma.account.findFirst({
        where: {
          userId,
          providerId: "github",
        },
      });
      if (!account?.accessToken) {
        throw new Error("No Github access token found");
      }

      const files = await getRepoSampleFiles(account.accessToken, owner, repo, 20);
      return { files };
    }) as { files: { path: string, content: string }[] };

    if (files.length === 0) {
      return { success: false, reason: "No code files found in repository" };
    }

    const architectureProfile = await step.run("generate-profile", async () => {
      return await generateArchitectureProfile(files);
    }) as string;

    await step.run("save-profile-to-db", async () => {
      await prisma.repository.updateMany({
        where: { owner, name: repo },
        data: { architectureProfile },
      });
    });

    return { success: true, filesSampled: files.length };
  }
);
