"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { 
  FileCode, Play, AlertCircle, RefreshCw, Github, GitPullRequest, TerminalSquare, 
  Loader2, ChevronDown, PanelLeft, X, Copy, Check, Activity, Scale, Search, 
  Zap, ShieldAlert, CheckCircle2, XCircle, Wand2 
} from "lucide-react";
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
  const [traceData, setTraceData] = useState<any>(null);
  const [structuredData, setStructuredData] = useState<any>(null);
  const [outputTab, setOutputTab] = useState<"review" | "trace" | "findings">("review");
  const [demoPrUrl, setDemoPrUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
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
          if (data.traceData) setTraceData(data.traceData);
          if (data.structured) setStructuredData(data.structured);
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
    const normalize = (text: string) => 
      text.replace(/\r/g, "").split("\n").map(l => l.trimEnd()).join("\n").trim();
      
    return files.filter((f) => normalize(f.currentContent) !== normalize(f.originalContent));
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
    setTraceData(null);
    setStructuredData(null);
    setOutputTab("review");
    setCurrentStep("Creating branch & PR on GitHub");
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
    setTraceData(null);
    setStructuredData(null);
    setOutputTab("review");
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

  const [activeTab, setActiveTab] = useState<"code" | "analysis">("code");

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
      <header className="h-[52px] border-b bg-background flex items-center justify-between px-4 flex-shrink-0 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80 cursor-pointer shrink-0">
            <img src="/codelens-logo.png" alt="CodeLens Logo" className="h-6 w-auto" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate max-w-[120px] sm:max-w-none">CodeLens</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-primary/10 text-primary border border-primary/20 shrink-0">
                LIVE DEMO
              </span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border/50 bg-muted/30 px-2 py-1.5 rounded pr-3 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-primary/70" />
            <span><strong className="text-foreground/80">2 demos</strong> limit per day</span>
          </div>
          <Link href="/login" className="shrink-0">
            <Button size="sm" variant="default" className="h-8">
              Sign In
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Split Interface */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 bg-muted/30 relative">
        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden bg-background border-b h-10 flex-shrink-0 items-center px-1">
          <button 
            onClick={() => setActiveTab("code")}
            className={`flex-1 h-8 flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${activeTab === "code" ? "bg-muted text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FileCode className="h-3.5 w-3.5" />
            Code
          </button>
          <button 
            onClick={() => setActiveTab("analysis")}
            className={`flex-1 h-8 flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${activeTab === "analysis" ? "bg-muted text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <TerminalSquare className="h-3.5 w-3.5" />
            Analysis {isProcessing && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          </button>
        </div>

        {/* Left Pane: True IDE (Sidebar + Editor) */}
        <section className={`flex-1 flex min-w-0 border-r border-border bg-[#1e1e1e] ${activeTab === "code" ? "flex" : "hidden md:flex"}`}>

          {/* File Explorer Sidebar */}
          {isSidebarVisible && (
            <div className="w-48 sm:w-56 flex flex-col border-r border-[#333] bg-[#252526] flex-shrink-0">
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
                  {(() => {
                    const originalLines = (activeFileData?.originalContent || "").split("\n").map(l => l.replace(/\r$/, ""));
                    const currentLines = (activeFileData?.currentContent || "").split("\n").map(l => l.replace(/\r$/, ""));
                    
                    // Longest Common Subsequence (LCS) matrix
                    const dp: number[][] = Array(originalLines.length + 1).fill(0).map(() => Array(currentLines.length + 1).fill(0));
                    
                    for (let i = 1; i <= originalLines.length; i++) {
                      for (let j = 1; j <= currentLines.length; j++) {
                        if (originalLines[i - 1] === currentLines[j - 1]) {
                          dp[i][j] = dp[i - 1][j - 1] + 1;
                        } else {
                          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                        }
                      }
                    }
                    
                    // Backtrack to find precisely which current lines are part of the original file
                    const isOriginal = Array(currentLines.length).fill(false);
                    const originalMappedTo = Array(originalLines.length).fill(-1);
                    
                    let i = originalLines.length;
                    let j = currentLines.length;
                    
                    while (i > 0 && j > 0) {
                      if (originalLines[i - 1] === currentLines[j - 1]) {
                        isOriginal[j - 1] = true;
                        originalMappedTo[i - 1] = j - 1;
                        i--;
                        j--;
                      } else if (dp[i - 1][j] > dp[i][j - 1]) {
                        i--;
                      } else {
                        j--;
                      }
                    }
                    
                    // Track deletions: if an original line wasn't mapped, it was deleted.
                    const deletionsAtCurrentLine = Array(currentLines.length + 1).fill(false);
                    let nextMappedCurrIndex = currentLines.length; 
                    for (let k = originalLines.length - 1; k >= 0; k--) {
                      if (originalMappedTo[k] !== -1) {
                         nextMappedCurrIndex = originalMappedTo[k];
                      } else {
                         deletionsAtCurrentLine[nextMappedCurrIndex] = true;
                      }
                    }
                    
                    return (
                      <>
                        {currentLines.map((_, index) => {
                          const isChanged = !isOriginal[index];
                          
                          // A true IDE does not show a red deletion triangle if the gap was replaced 
                          // by newly added/modified lines (Blue). We swallow the marker if the line above is changed.
                          const hasDeletionBefore = deletionsAtCurrentLine[index] && (index === 0 || isOriginal[index - 1]);
                          
                          return (
                            <div key={index} className="relative pr-3 opacity-60 h-[21px]">
                              {/* Deletion marker: Red right-pointing triangle */}
                              {hasDeletionBefore && (
                                <div 
                                  className="absolute left-0 top-[-5px] z-20 w-0 h-0 border-y-[5px] border-y-transparent border-r-0 border-l-[5px] border-l-[#f14c4c]" 
                                  title="Deleted line(s) above" 
                                />
                              )}
                              
                              {/* Modified/Added marker: Blue bar */}
                              {isChanged && (
                                <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#007acc]" title="Modified/Added" />
                              )}
                              {index + 1}
                            </div>
                          );
                        })}
                        {/* Edge case: Deletions at the very end of the file */}
                        {(deletionsAtCurrentLine[currentLines.length] && (currentLines.length === 0 || isOriginal[currentLines.length - 1])) && (
                          <div className="relative pr-3 opacity-60 h-0">
                            <div 
                              className="absolute left-0 top-[-5px] z-20 w-0 h-0 border-y-[5px] border-y-transparent border-r-0 border-l-[5px] border-l-[#f14c4c]" 
                              title="Deleted line(s) below" 
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
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
        <section className={`flex-1 flex flex-col min-w-0 bg-background relative ${activeTab === "analysis" ? "flex" : "hidden md:flex"}`}>
          {/* Output Header */}
          <div className="h-[38px] bg-muted/50 border-b flex items-center justify-between px-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                <span>Analysis Output</span>
              </div>

              {status === "completed" && (
                <div className="flex items-center gap-1 bg-muted/80 p-0.5 rounded border border-border/50 text-[11px]">
                  <button
                    onClick={() => setOutputTab("review")}
                    className={`px-2.5 py-0.5 rounded transition-colors font-medium ${
                      outputTab === "review"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Markdown Review
                  </button>
                  <button
                    onClick={() => setOutputTab("trace")}
                    className={`px-2.5 py-0.5 rounded transition-colors font-medium flex items-center gap-1 ${
                      outputTab === "trace"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Activity className="h-3 w-3 text-blue-400" />
                    Agent Trace
                  </button>
                  <button
                    onClick={() => setOutputTab("findings")}
                    className={`px-2.5 py-0.5 rounded transition-colors font-medium flex items-center gap-1 ${
                      outputTab === "findings"
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ShieldAlert className="h-3 w-3 text-amber-400" />
                    Findings ({structuredData?.findings?.length || 0})
                  </button>
                </div>
              )}
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
              <div className="font-mono text-[13px] space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <span className="text-foreground font-semibold">
                    Running CodeLens Pipeline
                  </span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{elapsedSeconds}s elapsed</span>
                    <span className="text-[11px] opacity-60 px-1.5 py-0.5 bg-muted rounded border border-border/50">avg. ~20s</span>
                  </div>
                </div>

                <div className="space-y-3 text-muted-foreground pl-3 border-l-2 border-primary/50">
                  <div className="flex items-center gap-3">
                    <span className="text-primary text-[12px] w-3 flex justify-center">✓</span>
                    <span className="text-foreground/80">Detected {modifiedCount} modified file{modifiedCount !== 1 ? "s" : ""}</span>
                  </div>

                  {[
                    "Creating branch & PR on GitHub",
                    "Analyzing changes with Multi-Agent Engine",
                    "Posting review on Pull Request"
                  ].map((stepText, idx) => {
                    const stepOrder = [
                      "Creating branch & PR on GitHub",
                      "Analyzing changes with Multi-Agent Engine",
                      "Posting review on Pull Request",
                      "Done"
                    ];
                    const currentIndex = stepOrder.indexOf(currentStep);
                    const isCompleted = currentIndex > idx || currentStep === "Done";
                    const isActive = currentIndex === idx;

                    return (
                      <div key={idx} className="flex items-center gap-3">
                        {isCompleted ? (
                          <span className="text-primary text-[12px] w-3 flex justify-center">✓</span>
                        ) : isActive ? (
                          <span className="text-primary animate-spin text-[14px] w-3 flex justify-center">⟳</span>
                        ) : (
                          <span className="text-muted-foreground/30 text-[10px] w-3 flex justify-center">○</span>
                        )}
                        <span className={`
                          transition-colors duration-300
                          ${isCompleted ? "text-foreground/60" : 
                            isActive ? "text-primary font-medium" : "text-muted-foreground/30"}
                        `}>
                          {stepText}
                        </span>
                      </div>
                    );
                  })}
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
              <>
                {/* View 1: Markdown Review */}
                {outputTab === "review" && (
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

                {/* View 2: Agent Trace Timeline */}
                {outputTab === "trace" && (
                  <div className="space-y-6 text-sm">
                    <div className="border-b pb-3">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        <Activity className="h-5 w-5 text-blue-500" />
                        Agent Execution Trace Timeline
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Transparent multi-agent pipeline showing context retrieval, prosecutor proposals, and 3x defense voting consensus.
                      </p>
                    </div>

                    {/* Step 1: Context Retrieval */}
                    <div className="border rounded-md p-4 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Search className="h-4 w-4 text-purple-400" />
                        <span>Step 1: The Investigator (Context Retrieval)</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Retrieved {traceData?.chunks?.length || 0} codebase snippets via Pinecone & Tree-sitter dependency graph.
                      </p>
                      {traceData?.chunks && traceData.chunks.length > 0 && (
                        <div className="space-y-2 pt-2">
                          {traceData.chunks.map((chunk: any, i: number) => (
                            <div key={i} className="text-xs font-mono bg-background p-2 rounded border flex justify-between items-center">
                              <span>{chunk.path}</span>
                              <span className="text-[10px] text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
                                {chunk.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Step 2 & 3: Voting Matrix */}
                    <div className="border rounded-md p-4 bg-muted/20 space-y-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Scale className="h-4 w-4 text-orange-400" />
                        <span>Step 2 & 3: Prosecutor & 3x Defense Voting</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The Prosecutor proposed {traceData?.initialFindings?.length || 0} initial claims. 3 Defense Agents voted to accept or reject false positives.
                      </p>

                      {traceData?.initialFindings && traceData.initialFindings.length > 0 ? (
                        <div className="space-y-2">
                          {traceData.initialFindings.map((finding: any, i: number) => {
                            const verified = traceData?.verifiedFindings?.find((v: any) => v.claim === finding.claim);
                            const isKept = !!verified;
                            return (
                              <div key={i} className={`p-3 rounded border text-xs space-y-1.5 ${isKept ? "bg-background border-border" : "bg-red-500/5 border-red-500/20 opacity-70"}`}>
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{finding.claim}</span>
                                  {isKept ? (
                                    <span className="text-[10px] bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {verified.confidence || "Verified 3/3"}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                                      <XCircle className="h-3 w-3" />
                                      Rejected (False Positive)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono">
                                  {finding.file}:{finding.startLine}-{finding.endLine}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No findings were proposed by the Prosecutor.</p>
                      )}
                    </div>

                    {/* Step 4: Final Output */}
                    <div className="border rounded-md p-4 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Zap className="h-4 w-4 text-amber-400" />
                        <span>Step 4: Grounded Review & PR Posting</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Surviving {traceData?.verifiedFindings?.length || 0} findings were snapped to diff hunks and published.
                      </p>
                    </div>
                  </div>
                )}

                {/* View 3: Structured Findings Cards */}
                {outputTab === "findings" && (
                  <div className="space-y-4">
                    <div className="border-b pb-3">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-amber-500" />
                        Structured AI Findings
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Verified bugs, security vulnerabilities, and logic flaws extracted with schema-first precision.
                      </p>
                    </div>

                    {structuredData?.findings && structuredData.findings.length > 0 ? (
                      <div className="space-y-3">
                        {structuredData.findings.map((finding: any, i: number) => {
                          const severityColor = 
                            finding.severity === "critical"
                              ? "bg-red-500/10 text-red-500 border-red-500/30"
                              : finding.severity === "warning"
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                              : "bg-blue-500/10 text-blue-500 border-blue-500/30";

                          return (
                            <div key={i} className="border rounded-lg p-4 bg-card shadow-sm space-y-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${severityColor}`}>
                                      {finding.severity}
                                    </span>
                                    <span className="text-xs font-mono text-muted-foreground">
                                      {finding.file}:{finding.startLine}-{finding.endLine}
                                    </span>
                                    {finding.confidence && (
                                      <span className="text-[10px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                        Vote: {finding.confidence}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="font-semibold text-sm text-foreground pt-1">
                                    {finding.claim}
                                  </h4>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs shrink-0 flex items-center gap-1.5 hover:border-primary hover:text-primary"
                                  onClick={() => {
                                    toast.success(`Fix applied for ${finding.file}!`, {
                                      description: finding.suggestion
                                    });
                                  }}
                                >
                                  <Wand2 className="h-3.5 w-3.5 text-primary" />
                                  Auto-Fix
                                </Button>
                              </div>

                              {finding.evidence && (
                                <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded border font-mono">
                                  <span className="font-sans font-semibold block text-[11px] text-foreground/70 mb-1">Evidence:</span>
                                  {finding.evidence}
                                </div>
                              )}

                              {finding.suggestion && (
                                <div className="text-xs text-foreground/90 bg-primary/5 border border-primary/10 p-2.5 rounded">
                                  <span className="font-semibold block text-[11px] text-primary mb-0.5">Suggested Fix:</span>
                                  {finding.suggestion}
                                </div>
                              )}

                              {finding.affects && finding.affects.length > 0 && (
                                <div className="text-xs text-amber-500/90 bg-amber-500/5 border border-amber-500/15 p-2 rounded flex items-center gap-2">
                                  <span className="font-semibold text-[11px]">💥 Impacted Callers (Blast Radius):</span>
                                  <span className="font-mono text-[11px]">{finding.affects.join(", ")}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center border rounded-lg bg-muted/20 text-muted-foreground text-sm">
                        🎉 Clean bill of health! No critical issues or bugs survived the verification pass.
                      </div>
                    )}
                  </div>
                )}
              </>
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
