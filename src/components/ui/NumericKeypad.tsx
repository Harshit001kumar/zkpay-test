"use client";

import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Delete } from "lucide-react";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  maxDecimals?: number;
  maxDigits?: number;
  className?: string;
}

export function NumericKeypad({
  value,
  onChange,
  onClear,
  maxDecimals = 2,
  maxDigits = 8,
  className = "",
}: NumericKeypadProps) {
  
  const triggerHaptic = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(12);
      } catch {}
    }
  }, []);

  const handleKeyPress = useCallback((key: string) => {
    triggerHaptic();

    if (key === "backspace") {
      if (!value || value === "0" || value.length <= 1) {
        onChange("0");
        return;
      }
      const nextVal = value.slice(0, -1);
      onChange(nextVal === "" ? "0" : nextVal);
      return;
    }

    if (key === ".") {
      if (value.includes(".")) return;
      if (!value || value === "0") {
        onChange("0.");
        return;
      }
      onChange(value + ".");
      return;
    }

    // Numbers 0-9
    if (value.includes(".")) {
      const parts = value.split(".");
      if (parts[1] && parts[1].length >= maxDecimals) return;
    }

    const cleanDigits = value.replace(".", "");
    if (cleanDigits.length >= maxDigits) return;

    if (value === "0" || value === "") {
      onChange(key);
    } else {
      onChange(value + key);
    }
  }, [value, onChange, maxDecimals, maxDigits, triggerHaptic]);

  const handleClear = useCallback(() => {
    triggerHaptic();
    if (onClear) onClear();
    else onChange("0");
  }, [onClear, onChange, triggerHaptic]);

  const keys = [
    { key: "1", sub: "" },
    { key: "2", sub: "ABC" },
    { key: "3", sub: "DEF" },
    { key: "4", sub: "GHI" },
    { key: "5", sub: "JKL" },
    { key: "6", sub: "MNO" },
    { key: "7", sub: "PQRS" },
    { key: "8", sub: "TUV" },
    { key: "9", sub: "WXYZ" },
    { key: ".", sub: "" },
    { key: "0", sub: "+" },
    { key: "backspace", sub: "" },
  ];

  return (
    <div className={`w-full max-w-sm mx-auto select-none ${className}`}>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {keys.map(({ key, sub }) => {
          const isBackspace = key === "backspace";
          const isDot = key === ".";

          return (
            <motion.button
              key={key}
              type="button"
              whileTap={{ scale: 0.92, backgroundColor: "rgba(255, 255, 255, 0.16)" }}
              whileHover={{ scale: 1.02 }}
              onClick={() => handleKeyPress(key)}
              onContextMenu={(e) => {
                if (isBackspace) {
                  e.preventDefault();
                  handleClear();
                }
              }}
              className={`relative flex flex-col items-center justify-center h-14 sm:h-16 rounded-2xl border transition-all duration-150 ${
                isBackspace
                  ? "bg-white/[0.03] hover:bg-white/[0.08] border-white/10 text-[#c6c6cd] hover:text-white"
                  : isDot
                  ? "bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-white font-mono text-2xl font-bold"
                  : "bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-white"
              }`}
            >
              {isBackspace ? (
                <div className="flex flex-col items-center justify-center">
                  <Delete className="w-5 h-5 sm:w-6 sm:h-6 text-[#c0c6de] transition-transform group-active:scale-90" />
                </div>
              ) : (
                <>
                  <span className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-white">
                    {key}
                  </span>
                  {sub && (
                    <span className="text-[9px] font-mono tracking-widest text-[#909097] -mt-0.5 opacity-70">
                      {sub}
                    </span>
                  )}
                </>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
