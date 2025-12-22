"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  getConnectedRepositories,
  disconnectRepository,
  disconnectAllRepositories,
} from "../actions"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"

import { ExternalLink, Trash2 } from "lucide-react"

export function RepositoryList() {
  const queryClient = useQueryClient()
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false)

  const { data: repositories, isLoading } = useQuery({
    queryKey: ["connected-repositories"],
    queryFn: getConnectedRepositories,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  /* ✅ Per-repo disconnect (uses disconnectRepository) */
  const disconnectRepoMutation = useMutation({
    mutationFn: (repoId: string) => disconnectRepository(repoId),
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        toast.success("Repository disconnected")
      } else {
        toast.error(result?.error)
      }
    },
    onError: () => {
      toast.error("Failed to disconnect repository")
    },
  })

  /* ✅ Disconnect all (uses disconnectAllRepositories) */
  const disconnectAllMutation = useMutation({
    mutationFn: disconnectAllRepositories,
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["connected-repositories"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        toast.success("All repositories disconnected")
        setDisconnectAllOpen(false)
      } else {
        toast.error(result?.error)
      }
    },
    onError: () => {
      toast.error("Failed to disconnect repositories")
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connected Repositories</CardTitle>
          <CardDescription>
            Manage your connected GitHub repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Connected Repositories</CardTitle>
            <CardDescription>
              Manage your connected GitHub repositories
            </CardDescription>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDisconnectAllOpen(true)}
            disabled={!repositories?.length}
          >
            Disconnect All
          </Button>
        </CardHeader>

        <CardContent className="space-y-2">
          {repositories?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No repositories connected.
            </p>
          )}

          {repositories?.map((repo, index) => (
            <div key={repo.id}>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span>{repo.fullName}</span>
                  <a href={repo.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                </div>

                {/* ✅ Per-repo delete dialog */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button>
                      <Trash2 className="h-4 w-4 text-destructive opacity-70 hover:opacity-100" />
                    </button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Disconnect Repository?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will disconnect{" "}
                        <strong>{repo.fullName}</strong> and delete all
                        associated AI reviews. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          disconnectRepoMutation.mutate(repo.id)
                        }
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={disconnectRepoMutation.isPending}
                      >
                        {disconnectRepoMutation.isPending
                          ? "Disconnecting..."
                          : "Disconnect"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {index !== repositories.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ✅ Disconnect All Dialog */}
      <AlertDialog
        open={disconnectAllOpen}
        onOpenChange={setDisconnectAllOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect all repositories?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect all repositories and delete all associated AI
              reviews. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectAllMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90"
              disabled={disconnectAllMutation.isPending}
            >
              {disconnectAllMutation.isPending
                ? "Disconnecting..."
                : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
