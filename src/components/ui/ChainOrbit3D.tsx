"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CHAIN_VISUALS } from "@/lib/chainVisuals";

/**
 * CSS 3D orbit: nine chain nodes ride a tilted ring around a central solver core.
 * Nodes are counter-rotated (billboarded) so labels always face the viewer.
 * Pure transforms, GPU composited, no canvas or WebGL runtime needed.
 */
export function ChainOrbit3D() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const activeChain = CHAIN_VISUALS.find((c) => c.id === active) || null;

  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto select-none" style={{ perspective: 1100 }}>
      {/* Backdrop grid + glow */}
      <div aria-hidden="true" className="absolute inset-0 grid-backdrop rounded-full" />
      <div aria-hidden="true" className="absolute inset-[22%] rounded-full bg-primary/20 blur-3xl" />

      {/* Orbit plane */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: "preserve-3d" }}>
        <div
          className={`relative w-[86%] h-[86%] rounded-full ${reduce ? "" : "orbit-ring"}`}
          style={{
            transformStyle: "preserve-3d",
            transform: reduce ? "rotateX(68deg)" : undefined,
            animationPlayState: active ? "paused" : "running",
          }}
        >
          {/* Rings */}
          <div className="absolute inset-0 rounded-full border border-primary/30" />
          <div className="absolute inset-[12%] rounded-full border border-dashed border-secondary/20" />
          <div className="absolute inset-[26%] rounded-full border border-primary/15" />

          {CHAIN_VISUALS.map((c, i) => {
            const angle = (i / CHAIN_VISUALS.length) * Math.PI * 2;
            const x = 50 + Math.cos(angle) * 50;
            const y = 50 + Math.sin(angle) * 50;
            return (
              <div
                key={c.id}
                className="absolute"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%, -50%)",
                  transformStyle: "preserve-3d",
                }}
              >
                <div
                  className={reduce ? "" : "orbit-billboard"}
                  style={{
                    transform: reduce ? "rotateX(-68deg)" : undefined,
                    animationPlayState: active ? "paused" : "running",
                  }}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActive(c.id)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(c.id)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive((v) => (v === c.id ? null : c.id))}
                    aria-label={`${c.name}, ${c.vm}, finality ${c.finality}`}
                    className={`group flex flex-col items-center gap-1 cursor-pointer focus-visible:outline-none`}
                  >
                    <span
                      className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold border transition-transform duration-300 ${
                        active === c.id ? "scale-110" : "group-hover:scale-105"
                      }`}
                      style={{
                        background: `radial-gradient(circle at 30% 20%, ${c.color}50, #0B0E14 70%)`,
                        borderColor: `${c.color}80`,
                        boxShadow: active === c.id ? `0 0 28px ${c.color}66` : `0 10px 24px -12px ${c.color}88`,
                        color: "#F4F7FB",
                      }}
                    >
                      {c.code}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Central solver core */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center text-center bg-surface-container-low/90 backdrop-blur-xl border border-outline-variant shadow-elevated"
        >
          <span className="absolute inset-0 rounded-full border border-secondary/30 motion-safe:animate-ping [animation-duration:3s]" />
          {activeChain ? (
            <>
              <span className="font-mono text-sm sm:text-base font-semibold" style={{ color: activeChain.color }}>
                {activeChain.code}
              </span>
              <span className="text-[11px] text-on-surface">{activeChain.name}</span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">
                {activeChain.vm} · {activeChain.finality}
              </span>
            </>
          ) : (
            <>
              <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold text-sm mb-1">
                Z
              </span>
              <span className="text-[11px] font-medium text-on-surface">Solver core</span>
              <span className="text-[10px] text-on-surface-variant">9 native chains</span>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
