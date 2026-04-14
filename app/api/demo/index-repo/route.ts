import { NextRequest, NextResponse } from "next/server";
import { getRepoFileContents } from "@/module/github/lib/github";
import { indexCodebase } from "@/module/ai/lib/rag";

/**
 * One-time endpoint to index the playground repo into Pinecone.
 * Call this once via POST /api/demo/index-repo to populate RAG context.
 * Protected by a simple secret check so it can't be abused.
 */
export async function POST(req: NextRequest) {
  try {
    // Simple auth: require a secret header to prevent public abuse
    const authHeader = req.headers.get("x-admin-secret");
    if (authHeader !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.DEMO_GITHUB_TOKEN!;
    const owner = process.env.DEMO_GITHUB_OWNER!;
    const repo = process.env.DEMO_GITHUB_REPO!;

    if (!token || !owner || !repo) {
      return NextResponse.json(
        { error: "Demo environment variables not configured." },
        { status: 500 }
      );
    }

    // Fetch all files from the playground repo
    const files = await getRepoFileContents(token, owner, repo);

    // Index into Pinecone with repoId = "owner/repo"
    const repoId = `${owner}/${repo}`;
    await indexCodebase(repoId, files);

    return NextResponse.json({
      success: true,
      repoId,
      indexedFiles: files.length,
      message: `Successfully indexed ${files.length} files from ${repoId}.`,
    });
  } catch (error: any) {
    console.error("Demo index error:", error);
    return NextResponse.json(
      { error: "Failed to index repository", details: error.message },
      { status: 500 }
    );
  }
}
