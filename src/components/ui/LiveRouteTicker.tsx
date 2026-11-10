"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { chainVisual } from "@/lib/chainVisuals";

const ROUTES: Array<[string, string, string, string]> = [
  ["SOL", "sol", "USDC", "base"],
  ["BTC", "btc", "ETH", "eth"],
  ["USDT", "tron", "USDC", "base"],
  ["LTC", "ltc", "USDT", "polygon"],
  ["ETH", "eth", "SOL", "sol"],
  ["BNB", "bsc", "USDC", "sol"],
  ["TRX", "tron", "BTC", "btc"],
  ["USDC", "eth", "USDT", "tron"],
  ["ETH", "base", "LTC", "ltc"],
  ["USDT", "polygon", "SOL", "sol"],
];

function RouteChip({ route }: { route: [string, string, string, string] }) {
  const [fs, fc, ts, tc] = route;
  const f = chainVisual(fc);
  const t = chainVisual(tc);
  return (
    <span className="inline-flex items-center gap-2.5 h-11 px-4 rounded-full bg-surface-container-low/80 border border-outline-variant whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
      <span className="text-sm font-medium text-on-surface">{fs}</span>
      <span className="text-[11px] text-on-surface-variant">{f.name}</span>
      <ArrowRight className="w-3.5 h-3.5 text-secondary" />
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
      <span className="text-sm font-medium text-on-surface">{ts}</span>
      <span className="text-[11px] text-on-surface-variant">{t.name}</span>
    </span>
  );
}

/** Infinite marquee of supported native routes. Duplicated track for a seamless loop. */
export function LiveRouteTicker() {
  return (
    <div className="relative w-full overflow-hidden marquee-mask" aria-label="Example supported swap routes">
      <div className="flex w-max gap-3 animate-marquee hover:[animation-play-state:paused]">
        {[...ROUTES, ...ROUTES].map((r, i) => (
          <RouteChip key={`${r.join("-")}-${i}`} route={r} />
        ))}
      </div>
    </div>
  );
}
