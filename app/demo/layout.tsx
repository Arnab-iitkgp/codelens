import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Demo",
  description:
    "Try CodeLens without signing up. Edit real code in an IDE workspace and get an AI-powered code review in 30 seconds.",
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
