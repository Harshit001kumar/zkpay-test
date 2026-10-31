"use client";

import React, { useState, useEffect, memo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Globe2,
  QrCode,
  ShieldCheck,
  TrendingUp,
  CheckCircle2,
  Layers,
  Lock,
} from "lucide-react";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";

const HERO_SATELLITE_RAILS = [
  {
    code: "EUR",
    rail: "SEPA Instant",
    region: "Eurozone",
    latency: "0.6s",
    pos: "top-5 -left-2 sm:left-3",
    delay: 0,
  },
  {
    code: "USD",
    rail: "FedNow / RTP",
    region: "United States",
    latency: "0.4s",
    pos: "top-16 -right-2 sm:right-3",
    delay: 0.8,
  },
  {
    code: "BRL",
    rail: "Pix Instant",
    region: "Brazil",
    latency: "0.7s",
    pos: "bottom-24 -left-2 sm:left-4",
    delay: 1.6,
  },
  {
    code: "INR",
    rail: "NPCI UPI",
    region: "India",
    latency: "0.4s",
    pos: "bottom-10 -right-2 sm:right-4",
    delay: 2.2,
  },
];

function HeroSpatialStage3DComponent() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Tilt3DMonolith
      maxTilt={11}
      className="w-full max-w-[460px] mx-auto"
      innerClassName="p-4 sm:p-6 bg-gradient-to-b from-surface-container-low/90 via-surface-container-lowest to-surface-container-lowest"
    >
      <div
        style={shouldReduceMotion ? undefined : { transformStyle: "preserve-3d" }}
        className="relative flex flex-col items-center"
      >
        {/* Top Hardware Telemetry Bar (Z = 20px) */}
        <DepthLayer z={20} className="w-full flex items-center justify-between pb-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
            <span className="font-mono text-[11px] text-on-surface tracking-tight">
              3D SPATIAL ROUTER · 180+ COUNTRIES
            </span>
          </div>
          <span className="font-mono text-[11px] text-success px-2 py-0.5 rounded-full bg-success/10 border border-success/25">
            0.4s FINALITY
          </span>
        </DepthLayer>

        {/* Central 3D Hardware Viewport (Z = 10px) */}
        <div
          style={shouldReduceMotion ? undefined : { transformStyle: "preserve-3d" }}
          className="relative w-full mt-4 rounded-2xl overflow-hidden aspect-[4/4.3] bg-surface border border-white/10"
        >
          <img
            src="/zkpay_scanner_phone.jpg"
            alt="ZkPay 3D Global Multi-Currency QR Scanner Viewport"
            className="w-full h-full object-cover object-top opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/25 to-transparent pointer-events-none" />

          {/* Sweeping Laser Reticle Line */}
          <div className="scanner-laser" />

          {/* Corner 3D Optical Registration Brackets */}
          <div className="absolute inset-6 pointer-events-none">
            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-primary/80 rounded-tl-md" />
            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-primary/80 rounded-tr-md" />
            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-primary/80 rounded-bl-md" />
            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-primary/80 rounded-br-md" />
          </div>
        </div>

        {/* Floating 3D Currency Satellite Badges (Z = 46px) */}
        {HERO_SATELLITE_RAILS.map((sat) => (
          <DepthLayer
            key={sat.code}
            z={46}
            className={`hidden sm:block absolute ${sat.pos} pointer-events-none`}
          >
            <motion.div
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      y: [-4, 4, -4],
                    }
              }
              transition={{
                duration: 4.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: sat.delay,
              }}
              className="px-3 py-2 rounded-xl bg-surface/90 backdrop-blur-md border border-white/15 shadow-elevated flex items-center gap-2.5"
            >
              <span className="font-mono text-xs font-semibold text-on-surface px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10">
                {sat.code}
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-on-surface leading-none">
                  {sat.rail}
                </span>
                <span className="font-mono text-[10px] text-outline mt-0.5">
                  {sat.region} · {sat.latency}
                </span>
              </div>
            </motion.div>
          </DepthLayer>
        ))}

        {/* Bottom 3D Cryptographic Settlement Strip (Z = 34px) */}
        <DepthLayer
          z={34}
          className="w-full mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-on-surface">
                Non-Custodial Base Escrow
              </span>
              <span className="font-mono text-[10px] text-outline">
                40+ Currencies · Zero FX Markup
              </span>
            </div>
          </div>
          <span className="font-mono text-xs text-success font-medium">
            1.0% Flat
          </span>
        </DepthLayer>
      </div>
    </Tilt3DMonolith>
  );
}

export const HeroSpatialStage3D = memo(HeroSpatialStage3DComponent);

const GLOBAL_CORRIDORS = [
  { pair: "USDC -> USD", rail: "FedNow / Wire", latency: "0.4s", region: "United States" },
  { pair: "USDC -> EUR", rail: "SEPA Instant", latency: "0.6s", region: "36 European Nations" },
  { pair: "USDC -> GBP", rail: "Faster Payments", latency: "0.5s", region: "United Kingdom" },
  { pair: "USDC -> INR", rail: "NPCI UPI", latency: "0.4s", region: "India" },
  { pair: "USDC -> BRL", rail: "Central Bank Pix", latency: "0.7s", region: "Brazil" },
  { pair: "USDC -> JPY", rail: "Zengin System", latency: "0.9s", region: "Japan" },
  { pair: "USDC -> AED", rail: "UAE IPP", latency: "0.6s", region: "United Arab Emirates" },
  { pair: "USDC -> SGD", rail: "PayNow / FAST", latency: "0.5s", region: "Singapore" },
  { pair: "USDC -> MXN", rail: "SPEI Direct", latency: "0.6s", region: "Mexico" },
];

function GlobalCorridorStream3DComponent() {
  const shouldReduceMotion = useReducedMotion();
  const doubled = [...GLOBAL_CORRIDORS, ...GLOBAL_CORRIDORS];

  return (
    <div className="relative w-full overflow-hidden py-4 border-y border-white/10 bg-surface-container-lowest/70">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28 bg-gradient-to-r from-surface-container-lowest to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28 bg-gradient-to-l from-surface-container-lowest to-transparent z-10" />

      <motion.div
        animate={shouldReduceMotion ? undefined : { x: ["0%", "-50%"] }}
        transition={{
          duration: 34,
          repeat: Infinity,
          ease: "linear",
        }}
        className="flex items-center gap-4 w-max"
      >
        {doubled.map((item, idx) => (
          <div
            key={`${item.pair}-${idx}`}
            className="px-4 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.08] flex items-center gap-4 shrink-0"
          >
            <span className="font-mono text-xs font-semibold text-on-surface">
              {item.pair}
            </span>
            <span className="text-xs text-outline">{item.rail}</span>
            <span className="font-mono text-[11px] text-primary px-2 py-0.5 rounded bg-white/[0.04] border border-white/10">
              {item.latency}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export const GlobalCorridorStream3D = memo(GlobalCorridorStream3DComponent);

const INITIAL_QR_STANDARDS = [
  { id: "sepa", standard: "EPC QR / SEPA Instant", territory: "Eurozone (EUR)", time: "0.6s" },
  { id: "pix", standard: "BR Code / Pix Instant", territory: "Brazil (BRL)", time: "0.7s" },
  { id: "upi", standard: "BharatQR / NPCI UPI", territory: "India (INR)", time: "0.4s" },
  { id: "sgqr", standard: "SGQR / PayNow", territory: "Singapore (SGD)", time: "0.5s" },
];

function BentoAutoSortingCorridorsComponent() {
  const [items, setItems] = useState(INITIAL_QR_STANDARDS);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) return;
    const interval = setInterval(() => {
      setItems((prev) => {
        const next = [...prev];
        const first = next.shift();
        if (first) next.push(first);
        return next;
      });
    }, 3200);
    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 ${
              index === 0
                ? "bg-white/[0.06] border-primary/35"
                : "bg-white/[0.02] border-white/[0.07]"
            }`}
          >
            <div className="flex items-center gap-3">
              <QrCode
                className={`w-4 h-4 shrink-0 ${
                  index === 0 ? "text-primary" : "text-outline"
                }`}
                strokeWidth={1.5}
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-on-surface">
                  {item.standard}
                </span>
                <span className="text-[11px] text-outline">{item.territory}</span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-success">{item.time}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export const BentoAutoSortingCorridors = memo(BentoAutoSortingCorridorsComponent);

function BentoYieldCompounding3DComponent() {
  const [yieldValue, setYieldValue] = useState(12480.4218);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) return;
    const timer = setInterval(() => {
      setYieldValue((v) => v + 0.0019);
    }, 180);
    return () => clearInterval(timer);
  }, [shouldReduceMotion]);

  return (
    <div className="p-4 rounded-2xl bg-surface border border-white/10 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-outline">
          STEAKHOUSE PRIME VAULT · BASE
        </span>
        <span className="font-mono text-xs text-success px-2 py-0.5 rounded-full bg-success/10 border border-success/25">
          5.51% APY
        </span>
      </div>
      <div className="font-mono text-2xl sm:text-3xl font-semibold text-on-surface tracking-tight tabular-nums">
        ${yieldValue.toFixed(4)}
      </div>
      <div className="flex items-center justify-between text-[11px] text-outline pt-2 border-t border-white/[0.07]">
        <span>Zero lockup period</span>
        <span className="font-mono text-primary">Liquid on QR scan</span>
      </div>
    </div>
  );
}

export const BentoYieldCompounding3D = memo(BentoYieldCompounding3DComponent);
