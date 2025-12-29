"use client";

import { signIn } from "@/lib/auth-client";
import { GithubIcon, CheckCircle2 } from "lucide-react";
import { useState } from "react";

const LoginUI = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGithubLogin = async () => {
    setIsLoading(true);
    try {
      await signIn.social({ provider: "github" ,callbackURL:"/dashboard/home"});
    } catch (err) {
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.6fr_1fr]">

        {/* LEFT — PRODUCT STORY (DESKTOP ONLY) */}
        <section className="relative hidden lg:flex flex-col justify-center px-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#27272a_1px,transparent_0)] [background-size:28px_28px] opacity-25" />

          <div className="relative z-10 max-w-2xl">
            <h1 className="text-4xl xl:text-5xl font-semibold leading-tight tracking-tight">
              Code reviews that
              <span className="text-zinc-400"> don’t miss the obvious.</span>
            </h1>

            <p className="mt-6 text-lg text-zinc-400 max-w-xl">
              CodeLens analyzes pull requests line-by-line to surface bugs,
              performance issues, and architectural smells—instantly.
            </p>

            <ul className="mt-10 space-y-4 text-sm">
              {[
                "Automatic PR reviews on every commit",
                "Catches bugs, smells, and risky patterns",
                "Zero setup works with your GitHub repos",
                "Designed for teams that move fast",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-10 text-xs text-zinc-500">
              Built for engineers who care about correctness, not noise.
            </p>
          </div>
        </section>

        {/* RIGHT — AUTH PANEL */}
        <section className="flex items-center justify-center px-4 sm:px-6">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 shadow-2xl">
            <h2 className="text-lg font-medium">
              Get started with CodeLens
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Connect GitHub to analyze your repositories.
            </p>

            <button
              onClick={handleGithubLogin}
              disabled={isLoading}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium transition hover:bg-zinc-700 disabled:opacity-60"
            >
              {isLoading ? (
                <span className="animate-pulse">Signing in…</span>
              ) : (
                <>
                  <GithubIcon className="h-5 w-5" />
                  Continue with GitHub
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs text-zinc-500">
              Read-only access. No credentials stored. Revoke anytime.
            </p>
          </div>
        </section>

      </div>
    </main>
  );
};

export default LoginUI;
