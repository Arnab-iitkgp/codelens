"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession, signOut } from "@/lib/auth-client"
import { useTheme } from "next-themes"
import { Home, Settings, LogOut,Sun,Moon, Github, MessageSquare, Crown } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar"

export const AppSidebar = () => {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !session) return null
  
  // Use resolvedTheme to handle "system" theme properly
  const currentTheme = resolvedTheme || theme || "light"

  const user = session.user
  const userName = user.name || "User"
  const userImage = user.image

  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  const navigationItems = [
    { title: "Home", url: "/dashboard/home", icon: Home },
    { title: "Repository", url: "/dashboard/repository", icon: Github },
    { title: "Reviews", url: "/dashboard/reviews", icon: MessageSquare },
    { title: "Subscription", url: "/dashboard/subscription", icon: Crown },
    { title: "Settings", url: "/dashboard/settings", icon: Settings },
  ]

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(url + "/")

  return (
    <Sidebar collapsible="icon" className="border-r bg-background">
      {/* Top Branding */}
      <SidebarHeader className="h-14 flex px-4 border-b">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-sm font-semibold">
            CL
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">CodeLens</p>
            <p className="text-xs text-muted-foreground">
              AI Reviewer
            </p>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="pt-6">
        <SidebarMenu>
          {navigationItems.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.url)}
              >
                <Link href={item.url}>
                  <item.icon className="h-6 w-6 gap" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
            >
              {currentTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span>{currentTheme === "dark" ? "Light mode" : "Dark mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()}>
              {/* Avatar */}
              {userImage ? (
                <img
                  src={userImage}
                  alt={userName}
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                  {userInitials}
                </div>
              )}

              {/* Text */}
              <span>Sign out</span>
              <LogOut className="ml-auto h-4 w-4 opacity-70" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
