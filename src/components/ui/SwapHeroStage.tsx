"use client";

import React, { useRef, useState, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import SwapWidget from "@/components/SwapWidget";
import { ShieldCheck, Zap } from "lucide-react";

export function SwapHeroStage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (shouldReduceMotion || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;

      // Subtle tilt: max 6 degrees for stability
      const rotY = (px - 0.5) * 10;
      const rotX = (0.5 - py) * 10;

      setTilt({
        x: rotX,
        y: rotY,
        glareX: px * 100,
        glareY: py * 100,
      });
    },
    [shouldReduceMotion]
  );

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50 });
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerEnter={() => setIsHovered(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative w-full max-w-xl mx-auto perspective-[1200px]"
    >
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : {
                rotateX: tilt.x,
                rotateY: tilt.y,
              }
        }
        transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.6 }}
        style={{ transformStyle: "preserve-3d" }}
        className="w-full rounded-[2.25rem] p-1.5 sm:p-2 bg-gradient-to-b from-white/[0.09] via-white/[0.03] to-white/[0.01] border border-white/[0.12] shadow-elevated relative group"
      >
        {/* Dynamic Specular Sheen Glare */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[2.25rem] pointer-events-none transition-opacity duration-500 overflow-hidden"
          style={{
            opacity: isHovered ? 0.35 : 0,
            background: `radial-gradient(circle 380px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.18), transparent 80%)`,
          }}
        />

        {/* Inner Machined Chassis */}
        <div className="rounded-[calc(2.25rem-0.5rem)] bg-surface-container-low/95 border border-outline-variant overflow-hidden p-2 sm:p-4 space-y-3">
          {/* Top Status Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-outline-variant/60 text-xs text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary motion-safe:animate-pulse" />
              <span className="font-medium text-on-surface text-[11px]">Solver Network Active</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>Zero Custody</span>
            </div>
          </div>

          {/* Core Swap Widget */}
          <SwapWidget />
        </div>
      </motion.div>
    </div>
  );
}
