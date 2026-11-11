"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error for client debugging
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6 selection:bg-primary/20 selection:text-white">
      <div className="max-w-md w-full bg-surface-container border border-outline-variant rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Something went wrong
          </h2>
          <p className="text-xs text-outline leading-relaxed">
            {error?.message || "An unexpected error occurred while rendering this view."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 py-3 px-4 rounded-xl bg-primary text-surface font-semibold text-xs inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            className="flex-1 py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
          >
            <Home className="w-3.5 h-3.5 text-outline" />
            <span>Back Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
