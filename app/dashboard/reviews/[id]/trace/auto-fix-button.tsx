"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check } from "lucide-react";
import { executeAutoFix } from "@/module/ai/actions/fix";

export function AutoFixButton({
  owner,
  repo,
  prNumber,
  filePath,
  finding,
  startLine,
  endLine,
  reviewId,
  findingIndex,
  isFixed,
}: {
  owner: string;
  repo: string;
  prNumber: number;
  filePath: string;
  finding: string;
  startLine: number;
  endLine: number;
  reviewId?: string;
  findingIndex?: number;
  isFixed?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(isFixed || false);

  const handleFix = async () => {
    setIsLoading(true);
    try {
      const res = await executeAutoFix(
        owner,
        repo,
        prNumber,
        filePath,
        finding,
        startLine,
        endLine,
        reviewId,
        findingIndex
      );
      if (res.success) {
        setIsSuccess(true);
      } else {
        alert("Failed to Auto-Fix: " + res.error);
      }
    } catch (error) {
      alert("An error occurred during Auto-Fix.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Button variant="outline" size="sm" className="text-green-500 border-green-500/20 bg-green-500/10">
        <Check className="w-4 h-4 mr-2" />
        Fixed
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleFix}
      disabled={isLoading}
      className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 transition-all"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4 mr-2" />
      )}
      {isLoading ? "Fixing..." : "Auto-Fix"}
    </Button>
  );
}
