import type { ReactNode } from "react"
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { requireAuth } from "@/module/auth/utils/auth-utils"
import { Toaster } from "@/components/ui/sonner"
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {

  await requireAuth();
  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset className="flex flex-col bg-[#fafafa] dark:bg-[#09090b]">
        {/* Header */}
        <header className="flex h-14 items-center gap-4 border-b border-zinc-200 dark:border-white/[0.05] bg-[#fafafa] dark:bg-[#09090b] px-4">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-lg font-semibold tracking-tight">
            Dashboard
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
