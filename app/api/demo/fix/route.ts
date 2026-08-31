import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { inngest } from "@/inngest/client";

const RATE_LIMIT_HOURS = 24;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { demoReviewId, findingId } = body;

    if (!demoReviewId || typeof demoReviewId !== "string") {
      return NextResponse.json(
        { error: "demoReviewId is required." },
        { status: 400 }
      );
    }

    if (!findingId || typeof findingId !== "string") {
      return NextResponse.json(
        { error: "findingId is required." },
        { status: 400 }
      );
    }

    // Client IP rate limiting
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

    const cutoff = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000);
    const recentAttempts = await prisma.demoAttempt.count({
      where: {
        ipAddress: ip,
        createdAt: { gte: cutoff },
      },
    });

    if (recentAttempts >= 2) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "You can try demo features twice every 24 hours.",
        },
        { status: 429 }
      );
    }

    // Fetch DemoReview from database
    const demoReview = await prisma.demoReview.findUnique({
      where: { id: demoReviewId },
    });

    if (!demoReview) {
      return NextResponse.json(
        { error: "Demo review record not found." },
        { status: 404 }
      );
    }

    // Extract structured findings
    const structured = (demoReview.structured as any) || {};
    const findings: any[] = structured.inlineFindings || [];

    // Find the matching finding or build fallback text
    const finding = findings.find((f: any) => String(f.id) === String(findingId)) || findings[0];

    const filePath = finding?.path || "api.ts";
    const startLine = finding?.startLine || finding?.line || 1;
    const endLine = finding?.endLine || finding?.line || 10;
    const findingText = finding
      ? `[${finding.severity || "CRITICAL"}] ${finding.claim || "Issue detected"}: ${finding.reasoning || ""} Suggested fix: ${finding.suggestion || ""}`
      : "Automated patch generation requested.";

    // Trigger Inngest background event
    await inngest.send({
      name: "demo.fix.requested",
      data: {
        demoReviewId,
        findingId,
        filePath,
        startLine,
        endLine,
        findingText,
      },
    });

    return NextResponse.json({
      success: true,
      demoReviewId,
      findingId,
      message: "Auto-Fix agent booted. Generating patch...",
    });
  } catch (error: any) {
    console.error("Demo fix API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
