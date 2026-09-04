"use client";

import { useState, useEffect } from "react";

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  characters?: string;
  className?: string;
  encryptedClassName?: string;
}

const DEFAULT_CHARS = "0123456789ABCDEF!@#$&*~";

export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 8,
  characters = DEFAULT_CHARS,
  className = "",
  encryptedClassName = "text-[#c0c6de] opacity-80",
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isScrambling, setIsScrambling] = useState(true);

  useEffect(() => {
    let iteration = 0;
    setIsScrambling(true);

    const interval = setInterval(() => {
      setDisplayText(() =>
        text
          .split("")
          .map((char, index) => {
            if (char === " " || char === "-" || char === "_") return char;
            if (index < iteration / maxIterations) {
              return text[index];
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join("")
      );

      if (iteration >= text.length * maxIterations) {
        setDisplayText(text);
        setIsScrambling(false);
        clearInterval(interval);
      }

      iteration++;
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, maxIterations, characters]);

  return (
    <span className={`font-mono tracking-tight ${className} ${isScrambling ? encryptedClassName : ""}`}>
      {displayText}
    </span>
  );
}

export default DecryptedText;
