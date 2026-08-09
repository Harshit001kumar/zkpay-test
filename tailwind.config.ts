import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Obsidian Glass Design System
        background: "#131315",
        "on-background": "#e5e2e3",
        surface: {
          DEFAULT: "#131315",
          dim: "#131315",
          bright: "#39393a",
          container: "#201f21",
          "container-high": "#2a2a2b",
          "container-highest": "#353436",
          "container-low": "#1b1b1d",
          "container-lowest": "#0e0e0f",
          variant: "#353436",
          tint: "#c0c6de",
        },
        "on-surface": {
          DEFAULT: "#e5e2e3",
          variant: "#c6c6cd",
        },
        primary: {
          DEFAULT: "#c0c6de",
          container: "#020617",
        },
        "on-primary": {
          DEFAULT: "#2a3043",
          container: "#72778d",
        },
        secondary: {
          DEFAULT: "#bcc7de",
          container: "#3e495d",
        },
        outline: {
          DEFAULT: "#909097",
          variant: "#46464c",
        },
        error: {
          DEFAULT: "#ffb4ab",
          container: "#93000a",
        },
        "on-error": "#690005",
        silver: "#E2E8F0",
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        display: ["Hanken Grotesk", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        glass: "40px",
        "glass-heavy": "60px",
      },
      borderRadius: {
        glass: "12px",
      },
    },
  },
  plugins: [],
};
export default config;
