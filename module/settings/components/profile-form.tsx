"use client"

import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { getuserProfile, updateUserProfile } from "../actions"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function ProfileForm() {
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => getuserProfile(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (profile) {
      setName(profile.name || "")
      setEmail(profile.email || "")
    }
  }, [profile])

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) =>
      updateUserProfile(data),
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["user-profile"] })
        toast.success("Profile updated successfully")
      }
    },
    onError: () => {
      toast.error("Failed to update profile")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({ name, email })
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <Card className="w-full bg-white dark:bg-[#121214] border-zinc-200 dark:border-white/[0.05] shadow-sm">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Update your personal information
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="bg-transparent border-zinc-200 dark:border-white/[0.1] focus-visible:ring-1 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-300"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-transparent border-zinc-200 dark:border-white/[0.1] focus-visible:ring-1 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-300"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-all font-medium"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
