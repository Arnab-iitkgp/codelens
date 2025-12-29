import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Github, 
  Code2,
  ArrowRight
} from "lucide-react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session;
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/codelens-logo.png" 
                alt="CodeLens" 
                className="h-12 w-13"
              />
              <div>
                <p className="text-sm font-semibold">CodeLens</p>
                <p className="text-xs text-muted-foreground">AI Reviewer</p>
              </div>
            </div>
            {isAuthenticated ? (
              <Link href="/dashboard/home">
                <Button size="sm">
                  Go to Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Code reviews{" "}
              <span className="text-primary">with zero blind spots</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              CodeLens analyzes pull requests line-by-line to surface bugs,
              performance issues, and architectural smells in real time.
            </p>
            {isAuthenticated ? (
              <div className="mt-10">
                <Link href="/dashboard/home">
                  <Button size="lg" className="group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/login">
                  <Button size="lg" className="group">
                    Get started with GitHub
                    <Github className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline">
                    Learn more
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            )}
            <p className="mt-6 text-sm text-muted-foreground">
              Zero setup • Read-only access • Revoke anytime
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-24 lg:py-32 border-t">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="space-y-12">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Github className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-semibold">Connect your repository</h3>
                </div>
                <p className="text-muted-foreground ml-8">
                  Link your GitHub account. We request read-only access to your repositories.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Code2 className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-semibold">We review every PR</h3>
                </div>
                <p className="text-muted-foreground ml-8">
                  When you open a pull request, CodeLens analyzes the diff line-by-line, checking for bugs, performance issues, and code smells.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-semibold">Get actionable feedback</h3>
                </div>
                <p className="text-muted-foreground ml-8">
                  Comments are posted directly on your PR with specific suggestions and context-aware insights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-24 lg:py-32 border-t">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Start reviewing code automatically
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Connect your GitHub account to begin. No configuration required.
            </p>
            {isAuthenticated ? (
              <div className="mt-10">
                <Link href="/dashboard/home">
                  <Button size="lg" className="group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-10">
                <Link href="/login">
                  <Button size="lg" className="group">
                    Get started
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between">
            <div className="flex items-center gap-3 mb-4 sm:mb-0">
              <img 
                src="/codelens-logo.png" 
                alt="CodeLens" 
                className="h-8 w-8"
              />
              <div>
                <p className="text-sm font-semibold">CodeLens</p>
                <p className="text-xs text-muted-foreground">AI Reviewer</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for engineers who care about correctness, not noise.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
