"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/action";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
        <p className="text-muted-foreground">View all AI code reviews</p>
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
              ? review.review.replace(/\n{3,}/g, "\n\n").slice(0, 200)
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
                    {review.status === "FAILED" ? "Failed" : "Completed"}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-4">
                  <Dialog>
                    {/* Review Preview Box (Height-limited with gradient fade) */}
                    <div className="relative rounded-md border bg-muted/10 p-6 overflow-hidden max-h-64">
                      <div className="prose prose-sm dark:prose-invert max-w-none 
                        prose-headings:border-b prose-headings:pb-2 prose-headings:font-semibold
                        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                        prose-a:text-primary hover:prose-a:underline
                        prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                        prose-pre:bg-muted/50 prose-pre:border prose-pre:text-[13px]
                      ">
                        <Streamdown>{review.review || "No review content available."}</Streamdown>
                      </div>
                      
                      {/* Gradient overlay to fade text out at the bottom */}
                      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <DialogTrigger asChild>
                        <Button variant="secondary" size="sm">
                          View full review
                        </Button>
                      </DialogTrigger>

                      <Button asChild variant="secondary" size="sm" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">
                        <Link href={`/dashboard/reviews/${review.id}/trace`}>
                          View Agent Trace
                        </Link>
                      </Button>

                      {review.prurl && (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={review.prurl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View on GitHub
                          </Link>
                        </Button>
                      )}
                    </div>

                    {/* Full Review Modal */}
                    <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle>{review.prTitle}</DialogTitle>
                      </DialogHeader>
                      <div className="flex-1 overflow-y-auto p-4 rounded-md border bg-muted/10">
                        <div className="prose prose-sm dark:prose-invert max-w-none 
                          prose-headings:border-b prose-headings:pb-2 prose-headings:font-semibold
                          prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                          prose-a:text-primary hover:prose-a:underline
                          prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                          prose-pre:bg-muted/50 prose-pre:border prose-pre:text-[13px]
                        ">
                          <Streamdown>{review.review || "No review content available."}</Streamdown>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
