"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/action";
import Link from "next/link";

export default function ReviewsPage() {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => {
      const res = await getReviews();
      return res;
    },
    staleTime: 1000 * 60 * 5,
  });

  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>

        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-8 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Review History</h1>
        <p className="text-muted-foreground">
          View all AI code reviews
        </p>
      </div>

      {/* Empty State */}
      {reviews?.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No reviews found.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reviews?.map((review) => {
            const preview = review.review
              ? review.review
                  .replace(/\n{3,}/g, "\n\n")
                  .slice(0, 200)
              : "";

            return (
              <Card key={review.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold leading-tight">
                      {review.prTitle}
                    </CardTitle>

                    <p className="text-sm text-muted-foreground">
                      {review.repository.fullName} · PR #{review.prNumber}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <Badge
                    className={
                      review.status === "FAILED"
                        ? "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900"
                        : "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900"
                    }
                  >
                    {review.status === "FAILED"
                      ? "Failed"
                      : "Completed"}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Review Preview Box */}
                  <div className="rounded-md border bg-muted/40 p-4">
                    <pre className="whitespace-pre-wrap break-words text-sm text-muted-foreground leading-relaxed font-sans">
                      {preview || "No review content available."}
                    </pre>
                  </div>

                  {/* Action */}
                  {review.prurl && (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={review.prurl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Full Review on GitHub
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
