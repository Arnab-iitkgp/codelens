import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { inngest } from "@/inngest/client";

const RATE_LIMIT_HOURS = 24;
const ALLOWED_FILES = ["api.ts", "auth.js", "db.js", "utils.js", "server.ts"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support new multi-file format
    const files: Array<{ path: string; content: string }> = body.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "At least one modified file is required." },
        { status: 400 }
      );
    }

    // Validate each file
    for (const file of files) {
      if (!file.path || typeof file.path !== "string") {
        return NextResponse.json(
          { error: "Each file must have a valid path." },
          { status: 400 }
        );
      }
      // Only allow known playground files — prevent path injection
      if (!ALLOWED_FILES.includes(file.path)) {
        return NextResponse.json(
          { error: `File "${file.path}" is not an allowed playground file.` },
          { status: 400 }
        );
      }
      if (!file.content || typeof file.content !== "string") {
        return NextResponse.json(
          { error: `File ${file.path} must have content.` },
          { status: 400 }
        );
      }
      if (file.content.length > 10000) {
        return NextResponse.json(
          { error: `File ${file.path} is too long (max 10,000 characters).` },
          { status: 400 }
        );
      }
    }

    // Get client IP
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

    // Rate limit check: 1 attempt per IP per 24 hours
    const cutoff = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000);
    const recentAttempt = await prisma.demoAttempt.findFirst({
      where: {
        ipAddress: ip,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentAttempt) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "You can try the demo once every 24 hours.",
        },
        { status: 429 }
      );
    }

    // Store the code summary for db record
    const codeSummary = files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

    // Create demo review record
    const demoReview = await prisma.demoReview.create({
      data: {
        code: codeSummary,
        ipAddress: ip,
        status: "pending",
        currentStep: "Creating branch & PR on GitHub",
      },
    });

    // Record the attempt for rate limiting
    await prisma.demoAttempt.create({
      data: {
        ipAddress: ip,
      },
    });

    // Fire Inngest event with multi-file data
    await inngest.send({
      name: "demo.review.requested",
      data: {
        demoReviewId: demoReview.id,
        files,
      },
    });

    return NextResponse.json({
      id: demoReview.id,
      status: "pending",
      message: `Review started for ${files.length} file(s). This usually takes 20-30 seconds.`,
    });
  } catch (error: any) {
    console.error("Demo start error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
