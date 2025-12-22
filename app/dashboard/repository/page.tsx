"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRepositories } from "@/module/repository/hooks/use-repositories";
import { ExternalLink, Search } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { RepositoryListSkeleton } from "@/module/repository/components/repository-skeleton";

import { useState } from "react";
import { useConnectRepository } from "@/module/repository/hooks/use-connect-repository";
interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: string;
  language: string | null;
  topics: string[];
  isConnected?: boolean;
}
//TODO: Add debounce to search input, add filter by conected status

const RepositoryPage = () => {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useRepositories();

  const { mutate: connectRepo } = useConnectRepository();
  const [localConnectingId, setLocalConnectingId] = useState<number | null>(
    null
  );

  const handleConnect = async (repo: Repository) => {
    setLocalConnectingId(repo.id);
    connectRepo(
      {
        owner: repo.full_name.split("/")[0],
        repo: repo.name,
        githubId: repo.id,
      },
      {
        onSettled: () => setLocalConnectingId(null),
      }
    );
  };
  const [searchQuery, setSearchQuery] = useState("");
  const observerTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Fetch next page
          fetchNextPage();
        }
      },
      {
        threshold: 1.0,
      }
    );
    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }
    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage]);

  const allRepositories = data?.pages.flatMap((page) => page) || []; // for processing all pages

  const filterRepositories = allRepositories.filter(
    (repo: Repository) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  return (
    <div className=" space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
        <p className="text-muted-foreground">
          Manage all your Github Repositories
        </p>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search Your Repositories"
          className="pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      {isLoading && <RepositoryListSkeleton />}
      <div className="grid gap-4">
        {filterRepositories.map((repo: Repository) => (
          <Card key={repo.id} className="hover:shadow-lg transition-shadow p-4">
            <CardHeader>
              <div className=" flex items-start justify-between">
                <div className=" space-y-2 flex-1">
                  <div className=" flex items-center gap-2">
                    <CardTitle className=" text-lg font-semibold">
                      {repo.name}
                    </CardTitle>
                    <Badge variant="outline">
                      {repo.language || "Unknown"}
                    </Badge>
                    {repo.isConnected && (
                      <Badge variant="secondary">Connected</Badge>
                    )}
                  </div>
                  <CardDescription>{repo.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" asChild>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    onClick={() => handleConnect(repo)}
                    disabled={localConnectingId == repo.id || repo.isConnected}
                    variant={repo.isConnected ? "outline" : "default"}
                  >
                    {localConnectingId == repo.id
                      ? "Connecting..."
                      : repo.isConnected
                      ? "Connected"
                      : "Connect"}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div ref={observerTarget} className="py-4">
        {isFetchingNextPage && <RepositoryListSkeleton />}
        {!hasNextPage && allRepositories.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No more Repositories found, You have reached the end of the list
          </p>
        )}
      </div>
    </div>
  );
};

export default RepositoryPage;
