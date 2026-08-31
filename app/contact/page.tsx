"use client";

import { ArrowLeft, Mail, Copy, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function ContactPage() {
  const [copied, setCopied] = useState(false);
  const email = "codelenshq@gmail.com"; // You can easily change this to your actual email

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-6 selection:bg-zinc-200">
      <Link href="/" className="absolute top-8 left-8 text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-2 text-sm font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to home
      </Link>
      
      <div className="max-w-md w-full bg-white rounded-2xl border border-black/[0.04] shadow-[0_8px_30px_-4px_rgba(0,0,0,0.04)] p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-6">
          <Mail className="w-6 h-6 text-zinc-700" />
        </div>
        
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-2">Get in touch</h1>
        <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
          Have a question about CodeLens, need help with self-hosting, or want to report an issue? We'd love to hear from you.
        </p>
        
        <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-lg p-1.5 pl-4 mb-4">
          <span className="text-sm font-medium text-zinc-700 font-mono tracking-tight">{email}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleCopy}
            className="h-8 px-3 text-zinc-500 hover:text-zinc-900 flex items-center gap-2 transition-all bg-white border border-zinc-200 shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        
        <a href={`mailto:${email}`}>
          <Button className="w-full bg-zinc-900 text-white hover:bg-zinc-800 h-11 text-sm font-medium shadow-sm transition-all hover:scale-[1.01]">
            Open in Email App
          </Button>
        </a>
        
        <div className="mt-8 pt-6 border-t border-zinc-100 text-[13px] text-zinc-400">
          Or reach out via <a href="https://www.linkedin.com/in/arnab-dev/" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-900 font-medium transition-colors">LinkedIn</a>.
        </div>
      </div>
    </div>
  );
}
