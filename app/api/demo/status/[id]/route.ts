import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const demoReview = await prisma.demoReview.findUnique({
      where: { id },
    });

    if (!demoReview) {
      return NextResponse.json(
        { error: "Demo review not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: demoReview.id,
      status: demoReview.status,
      review: demoReview.review,
      traceData: demoReview.traceData,
      structured: demoReview.structured,
      prUrl: demoReview.prUrl,
      currentStep: demoReview.currentStep,
      createdAt: demoReview.createdAt,
    });
  } catch (error) {
    console.error("Demo status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
