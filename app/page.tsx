import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Github, ArrowRight, Network, ShieldCheck, Zap, Timer, CheckCircle2, Bot, SearchCode, XCircle, Check, Minus } from "lucide-react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Caveat } from "next/font/google";
import { ModeToggle } from "@/components/mode-toggle";

const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"] });

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session;
  
  return (
    <div className="min-h-screen bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-50 font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-300">
      
      {/* Navbar (Header) */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between relative">
            {/* Left: Logo */}
            <div className="flex items-center gap-3">
              <img src="/codelens-logo.png" alt="CodeLens" className="h-8 w-8 object-contain" />
              <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">CodeLens</span>
            </div>
            
            {/* Center: Links */}
            <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
              <a href="https://github.com/Arnab-iitkgp/codelens" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                <Github className="h-4 w-4" />
                Open Source
              </a>
              <a href="https://github.com/Arnab-iitkgp/codelens/tree/main/docs" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                Docs
              </a>
              <Link href="/contact" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                Contact
              </Link>
            </div>
            
            {/* Right: Auth / CTA */}
            <div className="flex items-center gap-4">
              <ModeToggle />
              {isAuthenticated ? (
                <Link href="/dashboard/home">
                  <Button size="sm" className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md border border-zinc-900 dark:border-zinc-100 px-5 h-9 text-sm font-medium shadow-none">
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors hidden sm:block">
                    Log in
                  </Link>
                  <Link href="/login">
                    <Button size="sm" className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md border border-zinc-900 dark:border-zinc-100 px-5 h-9 text-sm font-medium shadow-none">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Top Half / Hero Section */}
      <section className="relative pt-20 pb-12 lg:pt-28 lg:pb-16 overflow-hidden">
        <div className="container mx-auto px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-4xl text-center flex flex-col items-center">
            
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
              Your PR is bigger than the <span className="relative whitespace-nowrap">
                diff.
                <svg className="absolute -bottom-2 md:-bottom-3 left-0 w-full h-[14px] md:h-[20px] text-violet-500" viewBox="0 0 100 20" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M2,14 Q45,2 98,9 Q60,15 30,18" />
                </svg>
              </span>
            </h1>
            
            <p className="mt-6 text-lg sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              See what your changes can break — before they reach production.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              {isAuthenticated ? (
                <Link href="/dashboard/home">
                  <Button size="lg" className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md border border-zinc-900 dark:border-zinc-100 px-8 h-12 text-base font-medium shadow-sm group">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="lg" className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md border border-zinc-900 dark:border-zinc-100 px-8 h-12 text-base font-medium shadow-sm group">
                    Connect with GitHub
                    <Github className="ml-2 h-5 w-5 group-hover:scale-110 transition-transform" />
                  </Button>
                </Link>
              )}
              <Link href="/demo">
                <Button size="lg" className="bg-white dark:bg-[#18181b] text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-[#27272a] rounded-md border border-zinc-200 dark:border-zinc-800 px-8 h-12 text-base font-medium shadow-sm group">
                  View Demo
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
            
          </div>
        </div>
      </section>

      {/* Hero Visual Element */}
      <section className="relative w-full flex justify-center px-4 md:px-0">
        {/* Subtle grid background to match the "Code Graph" idea */}
        <div className="absolute inset-0 bg-zinc-50 border-t border-zinc-200 z-0 dark:hidden" style={{ backgroundImage: "radial-gradient(#e5e7eb 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        <div className="absolute inset-0 bg-[#121214] border-t border-white/[0.05] z-0 hidden dark:block" style={{ backgroundImage: "radial-gradient(#27272a 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        
        {/* Mock PR Window */}
        <div className="relative z-10 w-full max-w-3xl bg-[#fafafa] dark:bg-[#18181b] border border-zinc-200 dark:border-white/[0.05] rounded-xl shadow-2xl overflow-hidden mt-8 md:mt-12 -mb-12 md:-mb-16 translate-y-0 hover:-translate-y-2 transition-transform duration-700 ease-out flex flex-col">
          
          {/* Window Header */}
          <div className="flex items-center px-4 py-3 bg-[#fafafa] dark:bg-[#18181b] border-b border-zinc-200 dark:border-white/[0.05]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </div>
            <div className="flex-1 text-center font-sans">
              <span className="text-[13px] font-medium text-zinc-500 dark:text-zinc-500">GitHub Pull Request</span>
            </div>
          </div>

          {/* PR Conversation Area */}
          <div className="flex w-full pt-6 pb-8 px-4 md:px-8 relative bg-[#fafafa] dark:bg-[#18181b]">
            
            {/* Thread Vertical Line */}
            <div className="absolute left-[31px] md:left-[47px] top-12 bottom-12 w-px bg-zinc-200 dark:bg-zinc-800 z-0 hidden sm:block" />

            {/* Thread Content Wrapper */}
            <div className="flex-1 max-w-3xl mx-auto w-full relative z-10 flex flex-col gap-4">

              {/* 1. Bot Comment */}
              <div className="flex gap-4">
                <div className="shrink-0 mt-1 hidden sm:block z-10">
                  <div className="w-8 h-8 rounded-md bg-[#09090b] flex items-center justify-center shadow-sm ring-4 ring-[#fafafa] dark:ring-[#18181b] overflow-hidden">
                    <img src="/codelens-logo.png" alt="CodeLens" className="h-6 w-6 object-contain" />
                  </div>
                </div>
                
                <div className="flex-1 bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm overflow-hidden">
                  {/* Comment Header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 font-sans">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">CodeLens</span>
                    <span className="text-[13px] text-zinc-500 dark:text-zinc-400">reviewed 1 hour ago</span>
                  </div>
                  
                  {/* Comment Body */}
                  <div className="p-4 flex flex-col gap-4">
                    {/* Embedded Code Snippet */}
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden bg-white dark:bg-[#09090b]">
                      <div className="px-3 py-2 bg-zinc-50 dark:bg-[#18181b] border-b border-zinc-200 dark:border-zinc-800 font-mono text-[12px] text-zinc-600 dark:text-zinc-400">
                        src/services/payment.ts
                      </div>
                      <div className="font-mono text-[13px] leading-6 flex flex-col w-full text-zinc-800 dark:text-zinc-300 pb-2 pt-2">
                        <div className="flex w-full hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <div className="w-10 shrink-0 text-right pr-3 text-zinc-400 select-none">42</div>
                          <div className="pl-3 whitespace-pre">  const session = await db.transaction();</div>
                        </div>
                        <div className="flex w-full bg-red-50 dark:bg-rose-950/20 text-red-900 dark:text-rose-300">
                          <div className="w-10 shrink-0 text-right pr-3 text-red-400 dark:text-rose-500/70 select-none bg-red-100/50 dark:bg-rose-950/40">43</div>
                          <div className="pl-3 whitespace-pre">- <span className="opacity-70">await processPayment(user.id, amount);</span></div>
                        </div>
                        <div className="flex w-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300">
                          <div className="w-10 shrink-0 text-right pr-3 text-emerald-600 dark:text-emerald-500/70 select-none bg-emerald-100/50 dark:bg-emerald-950/40">43</div>
                          <div className="pl-3 whitespace-pre">+ await processPayment(user.id, amount, session);</div>
                        </div>
                        <div className="flex w-full hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <div className="w-10 shrink-0 text-right pr-3 text-zinc-400 select-none">44</div>
                          <div className="pl-3 whitespace-pre">  await notifyUser(user.id);</div>
                        </div>
                      </div>
                    </div>

                    {/* Text content */}
                    <div className="text-[14px] text-zinc-800 dark:text-zinc-300 space-y-2 font-sans mt-2">
                      <p className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100">Potential Transaction Leak detected.</p>
                      <p className="leading-relaxed">
                        While passing <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-900 dark:text-zinc-200 font-mono text-[12px] border border-zinc-200 dark:border-zinc-700">session</code> to <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-900 dark:text-zinc-200 font-mono text-[12px] border border-zinc-200 dark:border-zinc-700">processPayment</code> fixes the immediate scoping issue, the callee method in <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-900 dark:text-zinc-200 font-mono text-[12px] border border-zinc-200 dark:border-zinc-700">src/lib/payments/stripe.ts</code> does not currently commit or rollback the transaction on failure.
                      </p>
                    </div>
                    
                    {/* Reactions */}
                    <div className="mt-2 flex">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181b] text-xs text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-default">
                        <span className="text-sm">🫡</span> 2
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. User Reply */}
              <div className="flex gap-4">
                <div className="shrink-0 mt-1 hidden sm:block z-10">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shadow-sm ring-4 ring-[#fafafa] dark:ring-[#18181b] overflow-hidden">
                    <img src="https://github.com/shadcn.png" alt="arnab" className="w-full h-full object-cover grayscale opacity-90" />
                  </div>
                </div>
                <div className="flex-1 bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm overflow-hidden">
                  {/* Reply Header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 font-sans">
                    <span className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">arnab</span>
                    <span className="text-[13px] text-zinc-500 dark:text-zinc-400">just now</span>
                  </div>
                  {/* Reply Body */}
                  <div className="p-4 text-[14px] text-zinc-800 dark:text-zinc-300 font-sans flex flex-col gap-3">
                    <p>Whoops, good catch! I completely missed the rollback context in <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-900 dark:text-zinc-200 font-mono text-[12px] border border-zinc-200 dark:border-zinc-700">stripe.ts</code>. I'll push a fix passing the session down.</p>
                    {/* Reactions */}
                    <div className="flex mt-1">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181b] text-xs text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-default">
                        <span className="text-sm">✅</span> 1
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          
        </div>
      </section>

      {/* Asymmetrical Vibe Section (Inverted in Dark Mode) */}
      <section className="relative w-full min-h-[80vh] bg-[#09090b] dark:bg-[#fafafa] flex items-center justify-center border-t border-zinc-200 dark:border-black/[0.05] py-24 px-4 md:px-8 z-0 transition-colors duration-300">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center">
          
          {/* Left Side: Philosophy */}
          <div className="flex flex-col items-start max-w-[340px] mx-auto lg:mx-0">
            <h2 className="text-[24px] font-semibold text-zinc-100 dark:text-zinc-900 leading-tight tracking-tight">
              It's not about catching bugs.
            </h2>
            <p className="mt-1 text-[18px] text-zinc-500 dark:text-zinc-500 leading-tight">
              It's about trusting your architecture.
            </p>
            <div className="mt-8">
              <a href="https://github.com/Arnab-iitkgp/codelens/tree/main/docs" target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800 rounded-[8px] px-3.5 py-1.5 h-auto shadow-[0_0_15px_rgba(255,255,255,0.15)] dark:shadow-[0_4px_15px_rgba(0,0,0,0.05)] font-medium text-[13px] flex items-center transition-all">
                  <Github className="w-3.5 h-3.5 mr-1.5" />
                  View Documentation
                </Button>
              </a>
            </div>
          </div>

          {/* Right Side: Abstract Nodes Grid */}
          <div className="flex justify-center lg:justify-end w-full">
            <div 
              className="grid grid-cols-6 gap-3 w-full max-w-[560px]"
              style={{ maskImage: "radial-gradient(circle at center, black 35%, transparent 90%)", WebkitMaskImage: "radial-gradient(circle at center, black 35%, transparent 90%)" }}
            >
              
              {/* Row 1 */}
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] p-3 flex flex-col justify-between">
                <span className="text-[10px] text-zinc-800 dark:text-zinc-400 font-mono">±</span>
                <span className="text-[14px] text-zinc-800 dark:text-zinc-400 font-mono">§</span>
              </div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] p-3 flex flex-col justify-between">
                <span className="text-[10px] text-zinc-800 dark:text-zinc-400 font-mono">!</span>
                <span className="text-[14px] text-zinc-800 dark:text-zinc-400 font-mono">1</span>
              </div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] p-3 flex flex-col justify-between">
                <span className="text-[10px] text-zinc-800 dark:text-zinc-400 font-mono">@</span>
                <span className="text-[14px] text-zinc-800 dark:text-zinc-400 font-mono">2</span>
              </div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] p-3 flex flex-col justify-between">
                <span className="text-[10px] text-zinc-800 dark:text-zinc-400 font-mono">#</span>
                <span className="text-[14px] text-zinc-800 dark:text-zinc-400 font-mono">3</span>
              </div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] p-3 flex flex-col justify-between">
                <span className="text-[10px] text-zinc-800 dark:text-zinc-400 font-mono">$</span>
                <span className="text-[14px] text-zinc-800 dark:text-zinc-400 font-mono">4</span>
              </div>
              <div className="col-span-1" />

              {/* Row 2 */}
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] p-3 flex flex-col justify-end">
                 <span className="text-[13px] font-mono text-zinc-800 dark:text-zinc-400">→|</span>
              </div>
              
              {/* Highlight Node 1 */}
              <div className="col-span-2 rounded-[10px] border border-white/[0.04] dark:border-black/[0.04] bg-white/[0.02] dark:bg-black/[0.02] p-4 flex flex-col justify-between hover:bg-white/[0.03] dark:hover:bg-black/[0.03] transition-colors cursor-default">
                 <div className="text-zinc-500 mb-6">
                    <Network size={16} strokeWidth={1.5} />
                 </div>
                 <div className="leading-[1.4] antialiased">
                   <div className="text-[14px] font-medium text-zinc-300 dark:text-zinc-700">Holistic.</div>
                   <div className="text-[14px] text-zinc-500">Reads the whole repo, not just the diff.</div>
                 </div>
              </div>

              {/* Highlight Node 2 */}
              <div className="col-span-2 rounded-[10px] border border-white/[0.04] dark:border-black/[0.04] bg-white/[0.02] dark:bg-black/[0.02] p-4 flex flex-col justify-between hover:bg-white/[0.03] dark:hover:bg-black/[0.03] transition-colors cursor-default">
                 <div className="text-zinc-500 mb-6">
                    <ShieldCheck size={16} strokeWidth={1.5} />
                 </div>
                 <div className="leading-[1.4] antialiased">
                   <div className="text-[14px] font-medium text-zinc-300 dark:text-zinc-700">Ruthless.</div>
                   <div className="text-[14px] text-zinc-500">Debates every finding to filter noise.</div>
                 </div>
              </div>

              <div className="col-span-1" />

              {/* Row 3 */}
              {/* Highlight Node 3 */}
              <div className="col-span-2 rounded-[10px] border border-white/[0.04] dark:border-black/[0.04] bg-white/[0.02] dark:bg-black/[0.02] p-4 flex flex-col justify-between hover:bg-white/[0.03] dark:hover:bg-black/[0.03] transition-colors cursor-default">
                 <div className="text-zinc-500 mb-6">
                    <Zap size={16} strokeWidth={1.5} />
                 </div>
                 <div className="leading-[1.4] antialiased">
                   <div className="text-[14px] font-medium text-zinc-300 dark:text-zinc-700">Automated.</div>
                   <div className="text-[14px] text-zinc-500">Triggers instantly on every PR.</div>
                 </div>
              </div>
              
              {/* Highlight Node 4 */}
              <div className="col-span-2 rounded-[10px] border border-white/[0.04] dark:border-black/[0.04] bg-white/[0.02] dark:bg-black/[0.02] p-4 flex flex-col justify-between hover:bg-white/[0.03] dark:hover:bg-black/[0.03] transition-colors cursor-default">
                 <div className="text-zinc-500 mb-6">
                    <Timer size={16} strokeWidth={1.5} />
                 </div>
                 <div className="leading-[1.4] antialiased">
                   <div className="text-[14px] font-medium text-zinc-300 dark:text-zinc-700">Deterministic.</div>
                   <div className="text-[14px] text-zinc-500">Consistent, predictable feedback.</div>
                 </div>
              </div>

              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] flex items-center justify-center text-zinc-800 dark:text-zinc-400 font-mono text-[18px]">S</div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] flex items-center justify-center text-zinc-800 dark:text-zinc-400 font-mono text-[18px]">D</div>

              {/* Row 4 */}
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04]" />
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] flex items-center justify-center text-zinc-800 dark:text-zinc-400 font-mono text-[18px]">Z</div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] flex items-center justify-center text-zinc-800 dark:text-zinc-400 font-mono text-[18px]">X</div>
              <div className="col-span-1 aspect-square rounded-[10px] border border-white/[0.02] dark:border-black/[0.04] flex items-center justify-center text-zinc-800 dark:text-zinc-400 font-mono text-[18px]">C</div>
              
            </div>
          </div>
          
        </div>
      </section>

      {/* Value Proposition Grid */}
      <section className="relative w-full pt-24 pb-16 bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 border-t border-zinc-200 dark:border-zinc-800 z-10 px-4 md:px-8">
        <div className="w-full max-w-[1100px] mx-auto">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Card 1: AST Graph */}
            <div className="col-span-1 bg-[#F9F9F8] dark:bg-[#18181b] rounded-[24px] overflow-hidden flex flex-col h-[460px] border border-black/[0.03] dark:border-white/[0.05] transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.04)] dark:hover:shadow-none">
              <div className="p-8 pb-0">
                <h3 className="text-[16px] font-medium text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">Full codebase context</h3>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 leading-[1.6]">
                  CodeLens maps your entire repository so it understands cross-file dependencies and knows exactly what a change breaks.
                </p>
              </div>
              <div className="mt-6 mb-6 relative flex-grow mx-6 rounded-lg bg-[#F1F3F1] dark:bg-[#09090b]/50 overflow-hidden border border-black/[0.02] dark:border-white/[0.05] shadow-[inset_0_1px_4px_rgba(0,0,0,0.01)] dark:shadow-none">
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <div className="relative w-full h-full">
                     {/* Node 1 (Source) */}
                     <div className="absolute top-4 left-2 bg-white dark:bg-[#27272a] border border-black/[0.06] dark:border-white/[0.1] shadow-sm rounded-lg p-3 z-10 w-[150px]">
                        <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-400 mb-1.5">src/payment.ts</div>
                        <div className="text-[12px] text-zinc-800 dark:text-zinc-200 font-medium truncate">StripeAdapter.init()</div>
                     </div>
                     
                     {/* SVG Connecting Line */}
                     <svg className="absolute inset-0 w-full h-full z-0" style={{ pointerEvents: 'none' }}>
                        <path d="M 75,70 C 75,120 160,90 160,150" fill="none" stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeWidth="1.5" strokeDasharray="4 4" />
                        <path d="M 100,50 C 140,50 200,70 220,50" fill="none" stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeWidth="1.5" strokeDasharray="4 4" />
                     </svg>
                     
                     {/* Node 2 (Target 1) */}
                     <div className="absolute top-[140px] left-[90px] bg-white dark:bg-[#27272a] border border-black/[0.06] dark:border-white/[0.1] shadow-sm rounded-lg p-3 z-10 w-[140px]">
                        <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-400 mb-1.5">src/stripe.ts</div>
                        <div className="text-[12px] text-zinc-800 dark:text-zinc-200 font-medium">class StripeAdapter</div>
                     </div>
                     
                     {/* Node 3 (Target 2) */}
                     <div className="absolute top-[15px] right-[10px] bg-white dark:bg-[#27272a] border border-black/[0.06] dark:border-white/[0.1] shadow-sm rounded-lg p-3 z-10 w-[110px]">
                        <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-400 mb-1.5">src/config.ts</div>
                        <div className="text-[12px] text-zinc-800 dark:text-zinc-200 font-medium truncate">export const key</div>
                     </div>
                     
                     {/* Edge Label */}
                     <div className="absolute top-[95px] left-[110px] bg-[#F9F9F8] dark:bg-[#27272a] border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest text-zinc-400 dark:text-zinc-400 z-10">CALLS</div>
                   </div>
                </div>
              </div>
            </div>

            {/* Card 2: 3x Voting */}
            <div className="col-span-1 bg-[#F9F9F8] dark:bg-[#18181b] rounded-[24px] overflow-hidden flex flex-col h-[460px] border border-black/[0.03] dark:border-white/[0.05] transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.04)] dark:hover:shadow-none">
              <div className="p-8 pb-0">
                <h3 className="text-[16px] font-medium text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">Multi-agent verification</h3>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 leading-[1.6]">
                  Every finding faces a ruthless trial. Defense agents must independently verify the bug before you ever see it.
                </p>
              </div>
              <div className="mt-6 mb-6 relative flex-grow mx-6 rounded-lg bg-[#F5F4F0] dark:bg-[#09090b]/50 overflow-hidden border border-black/[0.02] dark:border-white/[0.05] shadow-[inset_0_1px_4px_rgba(0,0,0,0.01)] dark:shadow-none">
                <div className="absolute inset-x-4 top-4 bottom-0 bg-white dark:bg-[#27272a] rounded-t-md border-t border-l border-r border-black/[0.04] dark:border-white/[0.05] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] p-4 pb-0 flex flex-col">
                   <div className="flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase mb-4">
                      <span>Investigation #412</span>
                      <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600"></div> LIVE</span>
                   </div>
                   <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-200 mb-3 px-1 leading-normal flex flex-wrap items-center gap-x-1 gap-y-1.5">
                      <span>Flagged unpaginated query in</span>
                      <code className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">src/api/users.ts</code>
                   </div>
                   
                   <div className="border border-zinc-100 dark:border-zinc-700 rounded-lg overflow-hidden flex-shrink-0">
                      <div className="flex items-center justify-between p-2.5 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50/50 dark:bg-[#18181b]">
                         <span className="text-[12px] text-zinc-600 dark:text-zinc-400">Correctness Agent</span>
                         <span className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-300 tracking-wide flex items-center gap-1.5"><Check size={12} className="text-zinc-400 dark:text-zinc-500"/> CONFIRMED</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 border-b border-zinc-100 dark:border-zinc-700 bg-white dark:bg-[#27272a]">
                         <span className="text-[12px] text-zinc-600 dark:text-zinc-400">Security Agent</span>
                         <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 tracking-wide flex items-center gap-1.5"><Minus size={12} className="text-zinc-300 dark:text-zinc-600"/> ABSTAIN</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 bg-zinc-50/50 dark:bg-[#18181b]">
                         <span className="text-[12px] text-zinc-600 dark:text-zinc-400">Runtime Agent</span>
                         <span className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-300 tracking-wide flex items-center gap-1.5"><Check size={12} className="text-zinc-400 dark:text-zinc-500"/> CONFIRMED</span>
                      </div>
                   </div>
                   
                   <div className="mt-4 flex items-center justify-between px-1">
                      <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400 font-medium">Majority consensus</span>
                      <span className="text-[10px] font-bold text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#18181b] px-2.5 py-1 rounded shadow-sm tracking-wide">PROCEED</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Card 3: Inline PR Comments */}
            <div className="col-span-1 bg-[#F9F9F8] dark:bg-[#18181b] rounded-[24px] overflow-hidden flex flex-col h-[460px] border border-black/[0.03] dark:border-white/[0.05] transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.04)] dark:hover:shadow-none">
              <div className="p-8 pb-0">
                <h3 className="text-[16px] font-medium text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">Precise inline reviews</h3>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 leading-[1.6]">
                  Actionable feedback delivered exactly where you need it, completely eliminating the noise of traditional AI.
                </p>
              </div>
              <div className="mt-6 mb-6 relative flex-grow mx-6 rounded-lg bg-[#F2F4F5] dark:bg-[#09090b]/50 overflow-hidden border border-black/[0.02] dark:border-white/[0.05] shadow-[inset_0_1px_4px_rgba(0,0,0,0.01)] dark:shadow-none">
                <div className="absolute inset-0 p-5 pb-0 flex">
                  {/* Left vertical line area */}
                  <div className="w-6 flex flex-col items-center relative h-full">
                    <div className="absolute top-2 bottom-6 w-px bg-zinc-200 dark:bg-zinc-800"></div>
                    {/* Bot Avatar */}
                    <div className="w-5 h-5 rounded-full bg-[#09090b] z-10 flex items-center justify-center border-2 border-[#F9F9F8] dark:border-[#18181b] shadow-sm overflow-hidden">
                      <img src="/codelens-logo.png" alt="CodeLens" className="w-full h-full object-contain p-0.5" />
                    </div>
                    {/* User Avatar */}
                    <div className="w-5 h-5 rounded-full bg-zinc-300 dark:bg-zinc-700 z-10 mt-auto mb-4 border-2 border-[#F9F9F8] dark:border-[#18181b] overflow-hidden">
                      <img src="https://github.com/shadcn.png" alt="Avatar" className="w-full h-full object-cover grayscale opacity-80" />
                    </div>
                  </div>
                  
                  {/* Right Content area */}
                  <div className="flex-1 flex flex-col justify-between pl-3 h-full">
                    {/* Bot Comment Box */}
                    <div className="bg-white dark:bg-[#27272a] rounded-lg border border-black/[0.05] dark:border-white/[0.05] shadow-sm flex flex-col w-full">
                       <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.03] dark:border-white/[0.05]">
                         <span className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100">CodeLens</span>
                         <span className="text-[11px] text-zinc-400 dark:text-zinc-500">just now</span>
                       </div>
                       <div className="p-3 bg-white dark:bg-[#27272a] rounded-b-lg">
                         <div className="border border-black/[0.04] dark:border-zinc-700 rounded-md text-[10px] font-mono leading-relaxed overflow-hidden mb-2.5">
                            <div className="bg-zinc-50 dark:bg-[#18181b] border-b border-black/[0.04] dark:border-zinc-700 px-2 py-1.5 text-zinc-400 dark:text-zinc-500">src/components/profile.tsx</div>
                            <div className="flex bg-rose-50/40 dark:bg-rose-950/20 text-zinc-500 dark:text-zinc-400"><span className="w-5 text-center text-rose-300 dark:text-rose-500/50 border-r border-rose-100/50 dark:border-rose-950/50 bg-rose-50/50 dark:bg-rose-950/30 select-none">-</span><span className="pl-2 py-0.5 truncate">useEffect(() =&gt; {'{'} ... {'}'})</span></div>
                            <div className="flex bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300"><span className="w-5 text-center text-indigo-300 dark:text-indigo-500/50 border-r border-indigo-200/50 dark:border-indigo-950/50 bg-indigo-50/50 dark:bg-indigo-950/30 select-none">+</span><span className="pl-2 py-0.5 font-medium truncate">useEffect(() =&gt; {'{'} ... {'}'}, [userId])</span></div>
                         </div>
                         <div className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-snug">Missing dependency array. This effect will trigger on every render.</div>
                       </div>
                    </div>
                    
                    {/* User Reply Box */}
                    <div className="bg-white dark:bg-[#27272a] rounded-lg border border-black/[0.05] dark:border-white/[0.05] shadow-sm flex flex-col w-full">
                       <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.03] dark:border-white/[0.05]">
                         <span className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100">alex_dev</span>
                       </div>
                       <div className="px-3 py-2 text-[12px] text-zinc-600 dark:text-zinc-300">
                         ah, missed that edge case. fixed!
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative w-full py-32 bg-white dark:bg-[#09090b] px-4 md:px-8 border-t border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center text-center">
         <h2 className="text-[32px] md:text-[40px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center justify-center flex-wrap gap-x-2.5">
           Review PRs with <span className={`${caveat.className} text-[#0284c7] text-[44px] md:text-[52px] leading-[0.7] -rotate-2`}>confidence</span>
         </h2>
         <p className="text-[16px] text-zinc-500 dark:text-zinc-400 mt-4 mb-8 max-w-[500px]">
           Connect your GitHub and let's review your next PR.
         </p>
         <Link href="/login">
           <Button className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 h-[48px] px-8 rounded-lg text-[15px] font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] shadow-xl shadow-zinc-900/10">
              Start for free <ArrowRight className="w-4 h-4" />
           </Button>
         </Link>
      </section>

      {/* Footer */}
      <footer className="w-full bg-[#09090B] dark:bg-[#F5F4F0] border-t border-white/[0.05] dark:border-black/[0.05] pt-16 pb-8 px-4 md:px-8 transition-colors duration-300">
        <div className="w-full max-w-[1100px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
               <img src="/codelens-logo.png" alt="CodeLens" className="h-8 w-8 object-contain" />
               <span className="font-bold text-[18px] text-white dark:text-zinc-900 tracking-tight">CodeLens</span>
            </div>
            <p className="text-[14px] text-zinc-400 dark:text-zinc-600 max-w-[280px] leading-relaxed">
              The open-source, multi-agent code review engine for modern development teams.
            </p>
          </div>
          
          <div className="flex gap-12 md:gap-16">
            <div className="flex flex-col gap-3">
              <span className="text-[13px] font-semibold text-white dark:text-zinc-500 tracking-wide uppercase">Product</span>
              <a href="https://github.com/Arnab-iitkgp/codelens/tree/main/docs" target="_blank" rel="noopener noreferrer" className="text-[14px] text-zinc-400 dark:text-zinc-800 hover:text-white dark:hover:text-zinc-900 transition-colors">Documentation</a>
              <a href="https://github.com/Arnab-iitkgp/codelens/blob/main/docs/architecture.md" target="_blank" rel="noopener noreferrer" className="text-[14px] text-zinc-400 dark:text-zinc-800 hover:text-white dark:hover:text-zinc-900 transition-colors">Architecture</a>
              <a href="https://github.com/Arnab-iitkgp/codelens#self-hosting" target="_blank" rel="noopener noreferrer" className="text-[14px] text-zinc-400 dark:text-zinc-800 hover:text-white dark:hover:text-zinc-900 transition-colors">Self-Hosting</a>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[13px] font-semibold text-white dark:text-zinc-500 tracking-wide uppercase">Community</span>
              <a href="https://github.com/Arnab-iitkgp/codelens" target="_blank" rel="noopener noreferrer" className="text-[14px] text-zinc-400 dark:text-zinc-800 hover:text-white dark:hover:text-zinc-900 transition-colors">GitHub</a>
              <a href="https://discord.gg/codelens" target="_blank" rel="noopener noreferrer" className="text-[14px] text-zinc-400 dark:text-zinc-800 hover:text-white dark:hover:text-zinc-900 transition-colors">Discord</a>
              <a href="https://twitter.com/codelens" target="_blank" rel="noopener noreferrer" className="text-[14px] text-zinc-400 dark:text-zinc-800 hover:text-white dark:hover:text-zinc-900 transition-colors">Twitter</a>
            </div>
          </div>
          
        </div>
        
        <div className="w-full max-w-[1100px] mx-auto mt-16 pt-8 border-t border-white/[0.05] dark:border-black/[0.05] flex items-center justify-center">
          <p className="text-[13px] text-zinc-500">
            © 2026 CodeLens. Released under the MIT License.
          </p>
        </div>
      </footer>

    </div>
  );
}
