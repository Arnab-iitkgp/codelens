"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { runAutoFixAndComment } from "../lib/auto-fix";

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
    // This action spends the repository owner's GitHub token to write to their PR,
    // so it must verify the caller is signed in AND owns the target repository.
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      throw new Error("Unauthorized");
    }

    const owned = await prisma.repository.findFirst({
      where: { owner, name: repo, userId: session.user.id },
      select: { id: true },
    });

    if (!owned) {
      throw new Error("Repository not found or you do not have access to it.");
    }

    return await runAutoFixAndComment(
      owner,
      repo,
      prNumber,
      filePath,
      finding,
      startLine,
      endLine
    );
  } catch (error) {
    console.error("[AutoFix] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
