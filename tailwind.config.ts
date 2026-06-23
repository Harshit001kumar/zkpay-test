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
        "ocean-blue": "#0077be",
        "rich-indigo": "#4b0082",
        "obsidian": {
          50: "#e2e2e6",
          100: "#c0c7d2",
          200: "#8a919c",
          300: "#404751",
          400: "#333538",
          500: "#282a2d",
          600: "#1e2023",
          700: "#1a1c1f",
          800: "#111316",
          900: "#0c0e11",
          950: "#0a0b0d",
        },
        "surface": {
          DEFAULT: "#111316",
          dim: "#111316",
          bright: "#37393d",
          container: "#1e2023",
          "container-high": "#282a2d",
          "container-highest": "#333538",
          "container-low": "#1a1c1f",
          "container-lowest": "#0c0e11",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        glass: "20px",
      },
      borderRadius: {
        glass: "12px",
      },
      boxShadow: {
        "ocean-glow": "0 0 24px rgba(0, 119, 190, 0.3)",
        "ocean-glow-sm": "0 0 12px rgba(0, 119, 190, 0.2)",
      },
    },
  },
  plugins: [],
};
export default config;
