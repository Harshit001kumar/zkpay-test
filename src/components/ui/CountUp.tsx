"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring } from "framer-motion";

interface CountUpProps {
  to: number;
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({
  to,
  from = 0,
  decimals = 2,
  prefix = "",
  suffix = "",
  className = "",
}: CountUpProps) {
  const motionVal = useMotionValue(from);
  const springVal = useSpring(motionVal, {
    damping: 25,
    stiffness: 100,
    mass: 0.5,
  });

  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionVal.set(to);
  }, [to, motionVal]);

  useEffect(() => {
    const unsubscribe = springVal.on("change", (latest) => {
      if (spanRef.current) {
        spanRef.current.textContent = `${prefix}${latest.toFixed(decimals)}${suffix}`;
      }
    });
    return () => unsubscribe();
  }, [springVal, decimals, prefix, suffix]);

  return (
    <span
      ref={spanRef}
      className={`tabular-nums inline-block ${className}`}
    >
      {prefix}
      {to.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default CountUp;
