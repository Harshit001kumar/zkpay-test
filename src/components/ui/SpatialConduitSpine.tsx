"use client";

import React, { memo } from "react";
import { motion, MotionValue, useTransform, useSpring } from "framer-motion";

interface SpatialConduitSpineProps {
  scrollProgress: MotionValue<number>;
}

const SECTION_NODES = [
  { label: "Swap", offset: 0.12 },
  { label: "Matrix", offset: 0.36 },
  { label: "Bento", offset: 0.58 },
  { label: "Partner", offset: 0.78 },
  { label: "API", offset: 0.94 },
];

function SpatialConduitSpineComponent({ scrollProgress }: SpatialConduitSpineProps) {
  const smoothProgress = useSpring(scrollProgress, {
    stiffness: 85,
    damping: 24,
    restDelta: 0.001,
  });

  const photonTop = useTransform(smoothProgress, [0, 1], ["0%", "100%"]);

  return (
    <div
      aria-hidden="true"
      className="hidden xl:block fixed left-6 top-24 bottom-24 w-6 pointer-events-none z-20"
    >
      <div className="relative h-full w-full flex items-center justify-center">
        {/* Track Line */}
        <div className="absolute top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

        {/* Section Target Nodes */}
        {SECTION_NODES.map((node) => (
          <div
            key={node.label}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 group"
            style={{ top: `${node.offset * 100}%` }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-surface-container-high border border-outline-variant transition-colors duration-300" />
            <span className="text-[9px] font-medium text-on-surface-variant/50 opacity-0 xl:group-hover:opacity-100 transition-opacity whitespace-nowrap pl-2">
              {node.label}
            </span>
          </div>
        ))}

        {/* Traveling Photon Bead */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full flex items-center justify-center -translate-y-1/2"
          style={{ top: photonTop }}
        >
          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-full bg-secondary/30 blur-[2px] motion-safe:animate-pulse" />
          {/* Core nucleus */}
          <div className="w-1.5 h-1.5 rounded-full bg-secondary shadow-sm" />
        </motion.div>
      </div>
    </div>
  );
}

export const SpatialConduitSpine = memo(SpatialConduitSpineComponent);
