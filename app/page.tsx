import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Github, 
  ArrowRight,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session;
  return (
    <div className="min-h-screen bg-black text-white dark">

      {/* Navigation — floating with backdrop blur */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/60 border-b border-white/[0.04]">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/codelens-logo.png" 
                alt="CodeLens" 
                className="h-8 w-8"
              />
              <span className="text-sm font-semibold tracking-tight">CodeLens</span>
            </div>
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <Link href="/dashboard/home">
                  <Button size="sm" className="bg-white text-black hover:bg-zinc-200 rounded-full px-5 h-9 text-sm font-medium">
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
                    Sign in
                  </Link>
                  <Link href="/demo">
                    <Button size="sm" className="bg-white text-black hover:bg-zinc-200 rounded-full px-5 h-9 text-sm font-medium">
                      Try it
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section — full viewport, dot grid background */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden dot-grid">
        
        {/* Subtle emerald glow behind heading */}
        <div className="glow-emerald absolute inset-0 w-full h-full" />

        <div className="relative z-10 container mx-auto px-6 lg:px-8 py-32 lg:py-40">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05]">
              Code reviews{" "}
              <span className="text-emerald-400">with zero blind spots</span>
            </h1>
            <p className="mt-8 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              CodeLens analyzes pull requests line-by-line to surface bugs,
              performance issues, and architectural smells in real time.
            </p>
            {isAuthenticated ? (
              <div className="mt-12">
                <Link href="/dashboard/home">
                  <Button size="lg" className="bg-white text-black hover:bg-zinc-200 rounded-full px-8 h-12 text-base font-medium group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/login">
                  <Button size="lg" className="bg-white text-black hover:bg-zinc-200 rounded-full px-8 h-12 text-base font-medium group">
                    Get started with GitHub
                    <Github className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/demo">
                  <Button size="lg" variant="outline" className="rounded-full px-8 h-12 text-base font-medium group border-emerald-600/40 text-white hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all duration-200">
                    <span className="relative flex h-2 w-2 mr-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Try Live Demo
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            )}
            <p className="mt-8 text-sm text-zinc-500">
              Zero setup • No sign-up required • Get AI review in 30s
            </p>
          </div>
        </div>
      </section>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      {/* How It Works — editorial numbered steps */}
      <section className="relative py-24 sm:py-32 bg-black dot-grid">
        <div className="glow-emerald absolute inset-0 w-full h-full opacity-50" />
        <div className="relative z-10 container mx-auto px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="text-center mb-20">
              <p className="text-sm font-medium text-emerald-400 tracking-widest uppercase mb-3">How it works</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white">Three steps. Zero friction.</h2>
            </div>

            <div className="space-y-0">
              {/* Step 1 */}
              <div className="group flex gap-8 items-start py-10 border-t border-white/[0.06] hover:border-white/[0.12] transition-colors">
                <span className="text-4xl font-bold text-emerald-500/40 font-mono leading-none pt-1 select-none group-hover:text-emerald-400/60 transition-colors">01</span>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Connect your repository</h3>
                  <p className="text-[15px] text-zinc-400 leading-relaxed max-w-md">
                    Link your GitHub account with a single click. We only request read-only access.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="group flex gap-8 items-start py-10 border-t border-white/[0.06] hover:border-white/[0.12] transition-colors">
                <span className="text-4xl font-bold text-emerald-500/40 font-mono leading-none pt-1 select-none group-hover:text-emerald-400/60 transition-colors">02</span>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">AI reviews every PR</h3>
                  <p className="text-[15px] text-zinc-400 leading-relaxed max-w-md">
                    Open a pull request and CodeLens analyzes the diff line-by-line — bugs, perf issues, code smells.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="group flex gap-8 items-start py-10 border-t border-b border-white/[0.06] hover:border-white/[0.12] transition-colors">
                <span className="text-4xl font-bold text-emerald-500/40 font-mono leading-none pt-1 select-none group-hover:text-emerald-400/60 transition-colors">03</span>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Actionable feedback</h3>
                  <p className="text-[15px] text-zinc-400 leading-relaxed max-w-md">
                    Comments posted directly on your PR with specific suggestions and context-aware insights.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      {/* Bottom CTA */}
      <section className="relative py-24 sm:py-32 bg-black dot-grid overflow-hidden">
        <div className="glow-emerald absolute inset-0 w-full h-full" />
        <div className="relative z-10 container mx-auto px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-emerald-400 tracking-widest uppercase mb-4">Get started</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Ship better code, faster
            </h2>
            <p className="mt-5 text-lg text-zinc-400">
              Join developers using AI-powered reviews to catch bugs before they hit production.
            </p>
            {isAuthenticated ? (
              <div className="mt-10">
                <Link href="/dashboard/home">
                  <Button size="lg" className="bg-white text-black hover:bg-zinc-200 rounded-full px-8 h-12 text-base font-medium group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-10">
                <Link href="/login">
                  <Button size="lg" className="bg-white text-black hover:bg-zinc-200 rounded-full px-8 h-12 text-base font-medium group">
                    Get started free
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10 bg-black">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img 
                src="/codelens-logo.png" 
                alt="CodeLens" 
                className="h-6 w-6"
              />
              <span className="text-sm font-semibold text-white">CodeLens</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/demo" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Demo</Link>
              <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Sign in</Link>
              <a href="https://github.com/codelenshq" target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">GitHub</a>
            </div>
            <p className="text-sm text-zinc-600">
              © {new Date().getFullYear()} CodeLens
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
