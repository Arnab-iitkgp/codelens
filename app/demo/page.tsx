"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileCode, Play, AlertCircle, RefreshCw, Github, GitPullRequest, TerminalSquare, Loader2, ChevronDown, PanelLeft, X, Copy, Check } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/themes/prism-tomorrow.css";

// The files we want to show from the playground repo (skip config/lock files)
const EDITABLE_FILES = ["api.ts", "auth.js", "db.js", "utils.js", "server.ts"];
const DEMO_REPO_URL = "https://github.com/codelenshq/playground";

type RepoFile = {
  path: string;
  originalContent: string;
  currentContent: string;
};

function getLanguage(filename: string): string {
  if (filename.endsWith(".ts")) return "typescript";
  return "javascript";
}

function highlightCode(code: string, lang: string): string {
  const grammar = lang === "typescript" ? Prism.languages.typescript : Prism.languages.javascript;
  return Prism.highlight(code, grammar, lang);
}

export default function DemoPage() {
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [demoReviewId, setDemoReviewId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "reviewing" | "completed" | "failed">("idle");
  const [currentStep, setCurrentStep] = useState<string>("Waiting for PR execution...");
  const [reviewResult, setReviewResult] = useState<string>("");
  const [demoPrUrl, setDemoPrUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isRepoCollapsed, setIsRepoCollapsed] = useState(false);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  // Fetch files from GitHub on mount
  useEffect(() => {
    async function fetchFiles() {
      try {
        const fetched: RepoFile[] = [];
        for (const filename of EDITABLE_FILES) {
          const res = await fetch(
            `https://raw.githubusercontent.com/codelenshq/playground/main/${filename}`
          );
          if (res.ok) {
            const content = await res.text();
            fetched.push({
              path: filename,
              originalContent: content,
              currentContent: content,
            });
          }
        }
        setFiles(fetched);
        if (fetched.length > 0) {
          setActiveFile("");
          setOpenFiles([]);
        }
      } catch (e) {
        console.error("Failed to fetch repo files:", e);
        toast.error("Failed to load repository files.");
      } finally {
        setLoading(false);
      }
    }
    fetchFiles();
  }, []);

  // Timer for elapsed seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "pending" || status === "reviewing") {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  // Polling for review status
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkStatus = async () => {
      if (!demoReviewId || status === "completed" || status === "failed") return;

      try {
        const res = await fetch(`/api/demo/status/${demoReviewId}`);
        const data = await res.json();

        if (data.status === "completed") {
          setStatus("completed");
          if (data.currentStep) setCurrentStep(data.currentStep);
          setReviewResult(data.review);
          if (data.prUrl) setDemoPrUrl(data.prUrl);
        } else if (data.status === "failed") {
          setStatus("failed");
          toast.error("Code analysis failed.");
        } else if (data.status === "reviewing" && status === "pending") {
          setStatus("reviewing");
        }

        if (data.currentStep) {
          setCurrentStep(data.currentStep);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    if (demoReviewId && (status === "pending" || status === "reviewing")) {
      interval = setInterval(checkStatus, 3000);
    }

    return () => clearInterval(interval);
  }, [demoReviewId, status]);

  const updateFileContent = useCallback((path: string, newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, currentContent: newContent } : f))
    );
  }, []);

  const getModifiedFiles = useCallback(() => {
    return files.filter((f) => f.currentContent !== f.originalContent);
  }, [files]);

  const modifiedCount = getModifiedFiles().length;

  const handleStartReview = async () => {
    const modified = getModifiedFiles();
    if (modified.length === 0) {
      toast.error("No files have been modified. Edit at least one file to create a diff.");
      return;
    }

    setStatus("pending");
    setReviewResult("");
    setCurrentStep("Creating branch & PR on GitHub...");
    setElapsedSeconds(0);

    try {
      const res = await fetch("/api/demo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: modified.map((f) => ({
            path: f.path,
            content: f.currentContent,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("idle");
        if (res.status === 429) {
          toast.error(data.message || "Rate limit exceeded.");
        } else {
          toast.error(data.error || "Failed to start review.");
        }
        return;
      }

      setDemoReviewId(data.id);
    } catch (e) {
      console.error(e);
      setStatus("idle");
      toast.error("System error occurred.");
    }
  };

  const handleReset = () => {
    setDemoReviewId(null);
    setStatus("idle");
    setReviewResult("");
    setCurrentStep("Waiting for PR execution...");
    setDemoPrUrl(null);
    setElapsedSeconds(0);
  };

  const handleCopyReview = async () => {
    if (!reviewResult) return;
    try {
      await navigator.clipboard.writeText(reviewResult);
      setIsCopied(true);
      toast.success("Review copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy review.");
    }
  };

  const closeFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newOpenFiles = openFiles.filter((f) => f !== path);
    setOpenFiles(newOpenFiles);

    if (activeFile === path) {
      if (newOpenFiles.length > 0) {
        setActiveFile(newOpenFiles[0]);
      } else {
        setActiveFile("");
      }
    }
  };

  const openFile = (path: string) => {
    if (!openFiles.includes(path)) {
      setOpenFiles([...openFiles, path]);
    }
    setActiveFile(path);
  };

  const isProcessing = status === "pending" || status === "reviewing";
  const activeFileData = files.find((f) => f.path === activeFile);
  const lineCount = activeFileData ? activeFileData.currentContent.split("\n").length : 0;

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading repository files...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col font-sans overflow-hidden dark text-foreground">
      {/* Top Application Bar */}
      <header className="h-[52px] border-b bg-background flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img src="/codelens-logo.png" alt="CodeLens Logo" className="h-6 w-auto" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">CodeLens Workspace</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-primary/10 text-primary border border-primary/20">
                LIVE DEMO
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border/50 bg-muted/30 px-2 py-1.5 rounded pr-3">
            <AlertCircle className="h-3.5 w-3.5 text-primary/70" />
            <span><strong className="text-foreground/80">2 demos</strong> limit per day</span>
          </div>
          <Link href="/login">
            <Button size="sm" variant="default" className="h-8">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Split Interface */}
      <main className="flex-1 flex min-h-0 bg-muted/30">
        {/* Left Pane: True IDE (Sidebar + Editor) */}
        <section className="flex-1 flex min-w-0 border-r border-border bg-[#1e1e1e]">

          {/* File Explorer Sidebar */}
          {isSidebarVisible && (
            <div className="w-56 flex flex-col border-r border-[#333] bg-[#252526] flex-shrink-0 hidden lg:flex">
              <div className="h-[38px] flex items-center justify-between pl-4 pr-2 text-[11px] font-semibold tracking-wider text-[#ccc]">
                EXPLORER
                <button
                  onClick={() => setIsSidebarVisible(false)}
                  className="p-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-[#333]"
                  title="Hide Sidebar"
                >
                  <PanelLeft className="h-3.5 w-3.5 text-[#ccc]" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pt-2">
                <div
                  onClick={() => setIsRepoCollapsed(!isRepoCollapsed)}
                  className="px-2 py-2 flex items-center gap-1.5 text-[11px] font-bold text-[#ccc] cursor-pointer hover:bg-[#2a2d2e] select-none"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isRepoCollapsed ? "-rotate-90" : ""}`} />
                  PLAYGROUND REPOSITORY
                </div>
                {!isRepoCollapsed && (
                  <div className="flex flex-col mt-1">
                    {files.map(file => {
                      const isActive = file.path === activeFile;
                      const isModified = file.currentContent !== file.originalContent;
                      return (
                        <button
                          key={file.path}
                          onClick={() => openFile(file.path)}
                          className={`flex items-center gap-1.5 pl-6 pr-3 py-1 text-[13px] font-mono text-left w-full transition-colors ${isActive ? "bg-[#37373d] text-[#fff]" : "text-[#cccc] hover:bg-[#2a2d2e]"
                            }`}
                        >
                          <FileCode className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-[#519aba]" : "text-[#6d8086]"}`} />
                          <span className="flex-1 truncate">{file.path}</span>
                          {isModified && <span className="w-2 h-2 rounded-full bg-[#c5c5c5] flex-shrink-0" title="Modified" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Sidebar Footer */}
              <div className="mt-auto flex-shrink-0">
                <Link
                  href={DEMO_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-3 bg-[#252526] hover:bg-[#2a2d2e] border-t border-[#333] text-muted-foreground hover:text-[#ccc] text-[12px] font-medium transition-colors"
                >
                  <Github className="h-4 w-4" />
                  Go to Repository 
                </Link>
              </div>
            </div>
          )}

          {/* Editor Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] overflow-hidden">
            {/* Tab Bar Container */}
            <div className="h-[38px] min-h-[38px] max-h-[38px] bg-[#252526] flex flex-row items-stretch flex-shrink-0 border-b border-[#1e1e1e] overflow-y-hidden">

              {/* Collapsed Sidebar Toggle */}
              {!isSidebarVisible && (
                <button
                  onClick={() => setIsSidebarVisible(true)}
                  className="px-3 flex items-center justify-center transition-colors border-r border-[#1e1e1e] flex-shrink-0 text-muted-foreground hover:text-[#ccc] hover:bg-[#2d2d2d]"
                  title="Show Sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              )}

              {/* Scrolling Tabs Container */}
              <div className="flex-1 flex overflow-x-auto items-stretch [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {openFiles.map((path) => {
                  const file = files.find(f => f.path === path);
                  const isActive = path === activeFile;
                  const isModified = file?.currentContent !== file?.originalContent;
                  return (
                    <button
                      key={path}
                      onClick={() => setActiveFile(path)}
                      className={`flex items-center gap-2 px-3 text-[13px] font-mono whitespace-nowrap transition-colors border-r border-[#1e1e1e] group flex-shrink-0 border-t-2 ${isActive
                        ? "bg-[#1e1e1e] text-[#ccc] border-t-[#007acc] h-full"
                        : "bg-[#2d2d2d] text-[#999] hover:bg-[#2a2a2a] border-t-transparent"
                        }`}
                    >
                      <FileCode className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-[#519aba]" : "text-[#6d8086]"}`} />
                      <span>{path}</span>
                      {isModified && !isActive && (
                        <span className="w-2 h-2 rounded-full bg-[#c5c5c5] flex-shrink-0" title="Modified" />
                      )}
                      <div
                        onClick={(e) => closeFile(path, e)}
                        className={`ml-1 p-0.5 rounded hover:bg-[#333] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${isActive ? "opacity-100" : ""}`}
                      >
                        <X className="h-3 w-3" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Action Button (Fixed on the right, never hidden) */}
              <div className="flex-shrink-0 px-3 bg-[#252526] flex items-center border-l border-[#1e1e1e]">
                <Button
                  onClick={handleStartReview}
                  disabled={isProcessing || modifiedCount === 0}
                  size="sm"
                  className="h-7 text-xs bg-[#007acc] hover:bg-[#005999] text-white rounded shadow-sm disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Play className="h-3 w-3 fill-current text-white" />
                      Submit & Raise PR
                      {modifiedCount > 0 && (
                        <span className="ml-1 bg-white/20 px-1.5 py-0 rounded text-[10px]">
                          {modifiedCount}
                        </span>
                      )}
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Editor Area with Line Numbers OR Empty State */}
            {activeFile ? (
              <div className="flex-1 flex overflow-hidden relative bg-[#1e1e1e]">
                {/* Gutter */}
                <div className="w-12 bg-[#1e1e1e] border-r border-[#333] text-[#858585] text-right font-mono text-[14px] leading-[21px] py-[16px] select-none flex-shrink-0 z-10 overflow-hidden">
                  {Array.from({ length: lineCount }).map((_, i) => (
                    <div key={i} className="pr-3 opacity-60 h-[21px]">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Code Editor */}
                <div className="flex-1 overflow-auto">
                  {activeFileData && (
                    <Editor
                      key={activeFile}
                      value={activeFileData.currentContent}
                      onValueChange={(val) => updateFileContent(activeFile, val)}
                      highlight={(code) =>
                        highlightCode(code, getLanguage(activeFile))
                      }
                      padding={16}
                      disabled={isProcessing}
                      style={{
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: 14,
                        lineHeight: "21px",
                        backgroundColor: "#1e1e1e",
                        minHeight: "100%",
                      }}
                      textareaClassName="focus:outline-none"
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-[#555] select-none">
                {/* Minimalist Logo / Icon Area */}
                <div className="relative mb-10">
                  <pre className="font-mono text-[11px] leading-tight text-[#007acc]/60">
                    {`   ______          __       __                     
  / ____/___  ____/ /___   / /   ___  ____  _____
 / /   / __ \\/ __  / _ \\  / /   / _ \\/ __ \\/ ___/
/ /___/ /_/ / /_/ /  __/ / /___/  __/ / / (__  ) 
\\____/\\____/\\__,_/\\___/ /_____/\\___/_/ /_/____/ `}
                  </pre>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Contextual Tips Area */}
                <div className="flex flex-col gap-3 max-w-[280px] w-full">
                  {!isSidebarVisible ? (
                    <Button
                      onClick={() => setIsSidebarVisible(true)}
                      variant="outline"
                      className="mb-4 border-[#333] hover:bg-[#252526] text-[#858585] text-xs h-9 flex items-center justify-center gap-2"
                    >
                      <PanelLeft className="h-3.5 w-3.5" />
                      Open File Explorer
                    </Button>
                  ) : null}

                  <div className="flex items-center gap-4 text-[13px] group">
                    <span className="w-24 text-[#666] text-right">Open file</span>
                    <div className="flex-1 h-px bg-[#2a2a2a]"></div>
                    <div className="flex gap-1 min-w-[70px] justify-end">
                      <kbd className="px-1.5 py-0.5 rounded bg-[#333] border border-[#444] text-[10px] text-[#aaa] font-sans">Explorer</kbd>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[13px] group">
                    <span className="w-24 text-[#666] text-right">Modify</span>
                    <div className="flex-1 h-px bg-[#2a2a2a]"></div>
                    <div className="flex gap-1 min-w-[70px] justify-end">
                      <kbd className="px-1.5 py-0.5 rounded bg-[#333] border border-[#444] text-[10px] text-[#aaa] font-sans italic">Type</kbd>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[13px] group">
                    <span className="w-24 text-[#666] text-right">Raise PR</span>
                    <div className="flex-1 h-px bg-[#2a2a2a]"></div>
                    <div className="flex gap-1 min-w-[70px] justify-end">
                      <kbd className="px-1.5 py-0.5 rounded bg-[#007acc]/30 border border-[#007acc]/50 text-[10px] text-[#007acc] font-sans font-bold">Submit</kbd>
                    </div>
                  </div>
                </div>

                {/* Bug Notice */}
                <div className="mt-8 flex items-start gap-2.5 max-w-[280px] bg-[#252526] border border-[#333] p-3 rounded-md text-[11px] text-[#858585] leading-relaxed">

                  <p>
                    <strong className="text-[#a88b50] font-medium border-b border-[#a88b50]/30 pb-0.5 mb-1 inline-block">Playground Note</strong><br />
                    This codebase was intentionally sprinkled with bugs. Try fixing them or introduce your own to see how CodeLens reacts.
                  </p>
                </div>

                {/* Footer */}

              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Output Console */}
        <section className="flex-1 flex flex-col min-w-0 bg-background relative">
          {/* Output Header */}
          <div className="h-[38px] bg-muted/50 border-b flex items-center justify-between px-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold text-foreground/80 uppercase tracking-wide">
                Analysis Output
              </span>
            </div>
            {status === "completed" && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs px-2 text-muted-foreground hover:bg-muted">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>

          {/* Console Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Idle State */}
            {status === "idle" && (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
                <div className="h-12 w-12 rounded-full border border-border flex items-center justify-center mb-4 bg-muted/30">
                  <GitPullRequest className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Ready for analysis</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Browse the real repository files using the tabs. Edit any file to introduce changes, then submit for review to see CodeLens analyze the diff.
                </p>
                {modifiedCount > 0 ? (
                  <p className="text-xs text-primary font-medium border border-primary/20 bg-primary/5 px-3 py-1.5 rounded">
                    {modifiedCount} file{modifiedCount !== 1 ? "s" : ""} modified — ready to submit
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60">
                    No files modified yet. Make a change to enable submission.
                  </p>
                )}
              </div>
            )}

            {/* Processing State */}
            {isProcessing && (
              <div className="font-mono text-[13px] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-foreground font-semibold">Running CodeLens Pipeline...</span>
                  <span className="text-muted-foreground">{elapsedSeconds}s elapsed</span>
                </div>
                <div className="space-y-2 text-muted-foreground pl-2 border-l-2 border-primary">
                  <p className="flex items-center gap-2">
                    <span className="text-primary">✓</span> Detected {modifiedCount} modified file{modifiedCount !== 1 ? "s" : ""}
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-primary animate-pulse">⟳</span> {currentStep}
                  </p>
                </div>
              </div>
            )}

            {/* Failed State */}
            {status === "failed" && (
              <div className="bg-destructive/10 border-l-4 border-destructive p-4 my-4">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-destructive mr-3 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-destructive">Execution Terminated</h3>
                    <div className="mt-1 text-sm text-destructive/80">
                      An error occurred during the analysis pipeline. Review generation failed.
                    </div>
                    <Button onClick={handleReset} variant="outline" size="sm" className="mt-4">
                      Try Again
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Completed State */}
            {status === "completed" && (
              <div className="prose prose-sm dark:prose-invert max-w-none 
                prose-headings:border-b prose-headings:pb-2 prose-headings:font-semibold
                prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                prose-a:text-primary hover:prose-a:underline
                prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-muted/50 prose-pre:border prose-pre:text-[13px]
              ">
                <Streamdown>{reviewResult}</Streamdown>
              </div>
            )}
          </div>

          {/* Action Footer */}
          {status === "completed" && (
            <div className="border-t bg-muted/30 p-4 shrink-0 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Analysis Completed
              </span>
              <div className="flex items-center gap-3">
                {demoPrUrl && (
                  <Link href={demoPrUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-8">
                      <Github className="mr-2 h-4 w-4" />
                      View Live PR
                    </Button>
                  </Link>
                )}
                <Button variant="outline" size="sm" className="h-8" onClick={handleCopyReview} disabled={!reviewResult}>
                  {isCopied ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Copy className="mr-2 h-4 w-4" />}
                  {isCopied ? "Copied" : "Copy Review"}
                </Button>
                <Link href="/login">
                  <Button size="sm" className="h-8 shadow-sm">
                    Connect GitHub to Automate
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
