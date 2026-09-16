"use client";

import React, { useRef, useCallback } from "react";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  spotlightColor?: string;
  className?: string;
}

export function SpotlightCard({
  children,
  spotlightColor = "rgba(192, 198, 222, 0.12)",
  className = "",
  ...props
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current || !spotlightRef.current) return;
    
    // Throttle style updates with requestAnimationFrame for smooth 60fps without React re-renders
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      if (!divRef.current || !spotlightRef.current) return;
      const rect = divRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      spotlightRef.current.style.setProperty("--mouse-x", `${x}px`);
      spotlightRef.current.style.setProperty("--mouse-y", `${y}px`);
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = "1";
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }
    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = "0";
    }
  }, []);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-2xl bg-white/[0.04] backdrop-blur-md border border-white/15 shadow-xl transition-colors duration-200 ${className}`}
      {...props}
    >
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 will-change-[opacity]"
        style={{
          background: `radial-gradient(500px circle at var(--mouse-x, -9999px) var(--mouse-y, -9999px), ${spotlightColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
