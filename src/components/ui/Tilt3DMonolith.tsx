"use client";

import React, { useRef, memo } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion";

interface Tilt3DMonolithProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  maxTilt?: number;
}

function Tilt3DMonolithComponent({
  children,
  className = "",
  innerClassName = "",
  maxTilt = 8,
}: Tilt3DMonolithProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacity = useMotionValue(0);

  const springConfig = { stiffness: 120, damping: 20, mass: 0.6 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);
  const smoothGlareX = useSpring(glareX, springConfig);
  const smoothGlareY = useSpring(glareY, springConfig);
  const smoothGlareOpacity = useSpring(glareOpacity, { stiffness: 140, damping: 24 });

  const rotateX = useTransform(smoothY, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-maxTilt, maxTilt]);

  const glareBackground = useMotionTemplate`radial-gradient(420px circle at ${smoothGlareX}% ${smoothGlareY}%, rgba(192, 198, 222, 0.14), rgba(52, 211, 153, 0.04) 38%, transparent 70%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (shouldReduceMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(nx);
    mouseY.set(ny);
    glareX.set(((e.clientX - rect.left) / rect.width) * 100);
    glareY.set(((e.clientY - rect.top) / rect.height) * 100);
    glareOpacity.set(1);
  };

  const handlePointerLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    glareOpacity.set(0);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ perspective: "1200px" }}
      className={`relative ${className}`}
    >
      <motion.div
        style={
          shouldReduceMotion
            ? undefined
            : {
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
              }
        }
        className="h-full w-full p-1.5 sm:p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20"
      >
        <div
          style={shouldReduceMotion ? undefined : { transformStyle: "preserve-3d" }}
          className={`relative h-full w-full rounded-[calc(2rem-0.375rem)] bg-surface-container-lowest border border-white/[0.07] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] overflow-hidden ${innerClassName}`}
        >
          {/* Specular 3D Surface Glare */}
          <motion.div
            aria-hidden="true"
            style={{
              background: glareBackground,
              opacity: smoothGlareOpacity,
            }}
            className="pointer-events-none absolute inset-0 z-0"
          />

          {/* Content Container */}
          <div
            style={shouldReduceMotion ? undefined : { transformStyle: "preserve-3d" }}
            className="relative z-10 h-full w-full"
          >
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export const Tilt3DMonolith = memo(Tilt3DMonolithComponent);

export function DepthLayer({
  z = 24,
  children,
  className = "",
}: {
  z?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <div
      style={
        shouldReduceMotion
          ? undefined
          : {
              transform: `translateZ(${z}px)`,
              transformStyle: "preserve-3d",
            }
      }
      className={className}
    >
      {children}
    </div>
  );
}
