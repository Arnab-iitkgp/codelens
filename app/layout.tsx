import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CodeLens — AI Code Reviews with Zero Blind Spots",
    template: "%s | CodeLens",
  },
  description:
    "CodeLens analyzes pull requests line-by-line to surface bugs, performance issues, and architectural smells in real time. AI-powered code reviews for GitHub.",
  keywords: [
    "AI code review",
    "code review tool",
    "GitHub code review",
    "automated code review",
    "pull request review",
    "code analysis",
    "CodeLens",
  ],
  openGraph: {
    title: "CodeLens — AI Code Reviews with Zero Blind Spots",
    description:
      "Analyzes pull requests line-by-line to surface bugs, performance issues, and code smells in real time.",
    type: "website",
    siteName: "CodeLens",
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeLens — AI Code Reviews with Zero Blind Spots",
    description:
      "Analyzes pull requests line-by-line to surface bugs, performance issues, and code smells in real time.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
        <body  className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased`}>
          <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
          </QueryProvider>
        </body>
      </html>
  );
}
