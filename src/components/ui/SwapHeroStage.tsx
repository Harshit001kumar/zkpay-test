"use client";

import React, { useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion";
import SwapWidget from "@/components/SwapWidget";
import { ShieldCheck } from "lucide-react";
import type { PopularPair } from "@/lib/chainVisuals";

interface SwapHeroStageProps {
  /** Optional route to prefill (e.g. from landing page quick-route chips). */
  pair?: PopularPair | null;
  /** Show floating 3D chain satellites around the stage (desktop only). */
  satellites?: boolean;
  onSwapCreated?: () => void;
}

const SATELLITES = [
  { code: "SOL", color: "#14F195", pos: "-left-10 top-16", z: 70, delay: 0 },
  { code: "BTC", color: "#F7931A", pos: "-right-9 top-28", z: 90, delay: 0.9 },
  { code: "BASE", color: "#2970FF", pos: "-left-12 bottom-28", z: 60, delay: 1.6 },
  { code: "USDT", color: "#26A17B", pos: "-right-12 bottom-16", z: 80, delay: 2.3 },
];

export function SwapHeroStage({ pair = null, satellites = false, onSwapCreated }: SwapHeroStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  // Pointer driven tilt with spring physics (no React re-render per frame)
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const springCfg = { stiffness: 160, damping: 22, mass: 0.6 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), springCfg);
  const rotateX = useSpring(useTransform(py, [0, 1], [6, -6]), springCfg);
  const glareX = useTransform(px, [0, 1], [0, 100]);
  const glareY = useTransform(py, [0, 1], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${glareX}% ${glareY}%, rgba(158, 192, 255, 0.14), transparent 70%)`;

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only tilt for mouse/pen; touch should scroll and type without the card moving
      if (reduce || e.pointerType === "touch" || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      px.set((e.clientX - rect.left) / rect.width);
      py.set((e.clientY - rect.top) / rect.height);
    },
    [reduce, px, py]
  );

  const handlePointerLeave = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
  }, [px, py]);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative w-full max-w-[520px] mx-auto"
      style={{ perspective: 1400 }}
    >
      {/* Ground glow under the floating stage */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-6 -bottom-8 h-24 rounded-[50%] bg-primary/20 blur-3xl pointer-events-none"
      />

      <motion.div
        style={
          reduce
            ? undefined
            : { rotateX, rotateY, transformStyle: "preserve-3d" }
        }
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-[2rem] p-1.5 sm:p-2 bg-gradient-to-b from-white/[0.10] via-white/[0.03] to-white/[0.01] border border-white/[0.10] shadow-elevated"
      >
        {/* Animated rim light */}
        <div
          aria-hidden="true"
          className="absolute -inset-px rounded-[2rem] pointer-events-none overflow-hidden"
        >
          <div className="absolute inset-0 rounded-[2rem] stage-rim" />
        </div>

        {/* Specular sheen following the pointer */}
        {!reduce && (
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 rounded-[2rem] pointer-events-none z-20 hidden md:block"
            style={{ background: glare }}
          />
        )}

        {/* Status strip */}
        <div
          className="relative flex items-center justify-between px-3 pt-1 pb-2 text-[11px] text-on-surface-variant"
          style={reduce ? undefined : { transform: "translateZ(20px)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-secondary/60 motion-safe:animate-ping" />
              <span className="relative w-2 h-2 rounded-full bg-secondary" />
            </span>
            <span className="text-on-surface font-medium">Solvers online</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Non-custodial</span>
          </span>
        </div>

        {/* Core swap widget, lifted on Z */}
        <div className="relative" style={reduce ? undefined : { transform: "translateZ(36px)" }}>
          <SwapWidget pair={pair} onSwapCreated={onSwapCreated} />
        </div>

        {/* Floating chain satellites */}
        {satellites &&
          SATELLITES.map((s) => (
            <div
              key={s.code}
              aria-hidden="true"
              className={`hidden xl:block absolute ${s.pos} pointer-events-none`}
              style={reduce ? undefined : { transform: `translateZ(${s.z}px)` }}
            >
              <motion.div
                animate={reduce ? undefined : { y: [-6, 6, -6] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
                className="flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full bg-surface-container-low/90 backdrop-blur-xl border border-outline-variant shadow-elevated"
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-surface"
                  style={{ backgroundColor: s.color }}
                >
                  {s.code.slice(0, 1)}
                </span>
                <span className="font-mono text-[11px] text-on-surface">{s.code}</span>
              </motion.div>
            </div>
          ))}
      </motion.div>
    </div>
  );
}
