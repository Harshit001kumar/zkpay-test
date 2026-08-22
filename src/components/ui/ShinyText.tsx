"use client";

import React from "react";

interface ShinyTextProps {
  text: string;
  className?: string;
  shimmerWidth?: number;
}

export function ShinyText({ text, className = "", shimmerWidth = 100 }: ShinyTextProps) {
  return (
    <span
      className={`inline-block bg-[length:200%_100%] bg-clip-text text-transparent animate-shiny-text ${className}`}
      style={{
        backgroundImage: `linear-gradient(120deg, rgba(229, 226, 227, 0.7) 0%, rgba(255, 255, 255, 1) 50%, rgba(229, 226, 227, 0.7) 100%)`,
      }}
    >
      {text}
    </span>
  );
}
