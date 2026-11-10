"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MousePointerClick, QrCode, CheckCircle2 } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: MousePointerClick,
    title: "Pick any route",
    desc: "Choose what you send and what you want back. Live quote in under a second, fees shown up front.",
    visual: (
      <div className="space-y-2">
        <div className="flex items-center justify-between h-10 px-3 rounded-xl bg-surface-container border border-outline-variant">
          <span className="font-mono text-sm text-on-surface">1.00</span>
          <span className="text-xs font-semibold text-on-surface">SOL</span>
        </div>
        <div className="flex items-center justify-between h-10 px-3 rounded-xl bg-surface-container border border-outline-variant">
          <span className="font-mono text-sm text-secondary">~ USDC</span>
          <span className="text-xs font-semibold text-on-surface">Base</span>
        </div>
      </div>
    ),
  },
  {
    n: "02",
    icon: QrCode,
    title: "Send to a one-time address",
    desc: "We generate a single-use deposit address. No wallet connection, no token approvals, nothing to sign.",
    visual: (
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-on-surface p-1.5 grid grid-cols-5 gap-0.5 shrink-0" aria-hidden="true">
          {Array.from({ length: 25 }).map((_, i) => (
            <span key={i} className={`rounded-[1px] ${[0, 1, 3, 5, 7, 9, 11, 12, 13, 15, 17, 19, 21, 23, 24].includes(i) ? "bg-surface" : ""}`} />
          ))}
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] text-on-surface-variant">Deposit address</span>
          <span className="block font-mono text-xs text-on-surface truncate">7vN2q...k9Px</span>
        </div>
      </div>
    ),
  },
  {
    n: "03",
    icon: CheckCircle2,
    title: "Receive natively",
    desc: "Solvers fill your order and deliver the real asset on the destination chain. No wrapped tokens, no bridge.",
    visual: (
      <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-secondary/10 border border-secondary/30">
        <CheckCircle2 className="w-4 h-4 text-secondary" />
        <span className="text-xs font-medium text-on-surface">Delivered on Base</span>
      </div>
    ),
  },
];

export function HowItWorks3D() {
  const reduce = useReducedMotion();

  return (
    <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6" style={{ perspective: 1200 }}>
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        return (
          <motion.li
            key={s.n}
            initial={reduce ? false : { opacity: 0, y: 40, rotateX: 18 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            whileHover={reduce ? undefined : { y: -6, rotateX: 4 }}
            className="relative rounded-[1.75rem] p-1.5 bg-white/[0.03] border border-outline-variant"
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="h-full rounded-[calc(1.75rem-0.375rem)] bg-surface-container-low p-5 sm:p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 text-primary flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="font-mono text-xs text-on-surface-variant">{s.n}</span>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-on-surface">{s.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{s.desc}</p>
              </div>
              <div className="mt-auto pt-2" style={reduce ? undefined : { transform: "translateZ(24px)" }}>
                {s.visual}
              </div>
            </div>

            {/* Connector to next step (desktop) */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="hidden md:block absolute top-1/2 -right-6 w-6 h-px bg-gradient-to-r from-primary/60 to-secondary/60"
              />
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}
