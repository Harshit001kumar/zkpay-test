# ZkPay Semantic Design System (DESIGN.md)

This semantic design system serves as the definitive source of truth for ZkPay interfaces, Google Stitch screen generation, and frontend engineering workflows.

---

## 1. Visual Atmosphere & Philosophy

- **Density:** 3 / 10 — "Art Gallery Airy". Macro-whitespace between sections (`py-32` to `py-44`), double standard padding. Interfaces breathe with generous negative space.
- **Variance:** 8 / 10 — "Offset Asymmetric". High layout variance. Zero repetitive grids. Asymmetrical split heroes, 7/5 bento columns, alternating visual anchors.
- **Motion:** 7 / 10 — "Perpetual Kinetic Tension". Smooth spring dynamics (`cubic-bezier(0.32, 0.72, 0, 1)`), GPU-safe transforms, animated laser reticles, magnetic hover tension.
- **Vibe Archetype:** Ethereal Hardware. Deepest OLED obsidian surfaces, brushed steel-blue metallic accents, hairlines, and machined concentric bezels.

---

## 2. Color Calibration Matrix

| Role | Descriptive Name | Hex Code | Usage |
|---|---|---|---|
| **Base Surface** | Obsidian Void | `#0e0e10` | Deepest page canvas, inner hardware cores |
| **Elevated Surface** | Obsidian Glass | `#131315` | Main containers, floating islands, cards |
| **Surface Accent** | Machine Charcoal | `#1b1b1d` | Double-bezel inner trays, elevated chips |
| **Primary Accent** | Brushed Steel Blue | `#c0c6de` | Key brand accents, reticle brackets, laser beam, badges |
| **On-Primary** | Deep Navy Shadow | `#2a3043` | Text placed on silver or steel-blue surfaces |
| **High-Contrast Text** | Pure Lunar White | `#e5e2e3` | H1/H2 headlines, primary button text |
| **Muted Body Text** | Atmospheric Grey | `#c6c6cd` | Body paragraphs, explanations (relaxed leading) |
| **Technical Label Text** | Slate Muted | `#909097` | Timestamps, currency tags, monospace labels |
| **Protocol Status** | Emerald Pulse | `#10b981` | Base Mainnet active heartbeat, verified badges |

### Strict Banned Color Patterns
- NO saturated neon purple/cyan AI gradients.
- NO raw primary colors (plain red, plain blue, plain green).
- NO harsh black drop shadows (`rgba(0,0,0,0.5)`). Shadows must be tinted to background obsidian hue.
- NO white/gray button outer glows.

---

## 3. Typographic Architecture

- **Display & Headlines:** `Geist Display` or `Outfit` with tight tracking (`-0.035em`) and controlled leading (`1.08`).
  - *2-Line Iron Rule:* Major H1 headings must NEVER exceed 2 to 3 lines. Always constrain with wide containers (`max-w-xl` to `max-w-2xl`) and fluid clamp sizing.
- **Body Copy:** Sans-serif (`14px`–`16px`, relaxed leading `1.6`, maximum 65 characters per line).
- **Numeric & Code Engine:** `JetBrains Mono` or `Geist Mono` for all currency amounts, gas fees, rates, wallet addresses, and transaction hashes.
- **Banned Typography:** Standard `Inter`, generic `Roboto`, `Arial`, `Times New Roman`.

---

## 4. Vanguard Component Standards

### A. The Double-Bezel (Doppelrand) Hardware Enclosure
Every primary card, scanner box, and calculator container uses concentric nested shells:
- **Outer Shell:** `p-2 rounded-[2.5rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5`
- **Inner Core:** `rounded-[calc(2.5rem-0.5rem)] bg-[#0e0e10] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]`

### B. Button-in-Button Nested Trailing Icon CTA
Primary interactive buttons must be fully rounded pills with a nested circular sub-element:
- **Outer Pill:** `rounded-full pl-7 pr-2.5 py-3 bg-[#e5e2e3] text-[#131315] font-bold text-xs uppercase tracking-wider hover:bg-white transition-all shadow-[0_10px_30px_rgba(229,226,227,0.18)] active:scale-[0.98] group flex items-center gap-3`
- **Inner Icon Wrapper:** `w-9 h-9 rounded-full bg-[#131315] text-white flex items-center justify-center transition-transform group-hover:translate-x-1 group-hover:-translate-y-0.5`

### C. Fluid Island Floating Navigation
Detached floating glass pill centered at `top-6`, `mx-auto`, `w-max max-w-5xl`, `rounded-full`, `bg-[#131315]/80 backdrop-blur-3xl border border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.6)] px-6 py-3`.

---

## 5. Layout & Spatial Rhythm

- **AIDA Structure:** Attention (Hero) → Interest (2-Step Timeline & Gapless Bento) → Desire (Oracle Calculator & 3D Obsidian Card) → Action (Button-in-Button CTA & Minimal Footer).
- **Macro-Whitespace:** `py-32` to `py-44` between all major sections.
- **Gapless Bento Grid:** Must use `grid-flow-dense` with interlocking column spans (e.g., 7/5 and 5/7). Zero dead or empty cells.
- **Mobile-First Collapse:** All multi-column layouts aggressively collapse to single column below `768px` (`grid-cols-1`, `w-full`, `px-4`). Never use `h-screen` — always use `min-h-[100dvh]`.

---

## 6. Motion & Physics Directives

- **Spring Physics Curve:** `transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]`.
- **GPU-Safe Transforms:** Animate exclusively via `transform` and `opacity`. Never animate `top`, `left`, `width`, or `height`.
- **Reduced Motion:** Strictly honor `@media (prefers-reduced-motion: reduce)` by disabling infinite loops and instantizing state transitions.
- **Continuous Pointer Tracking:** Use Framer Motion `useMotionValue` and `useTransform` for 3D card tilt — never use `useState` for mouse tracking.

---

## 7. Absolute Zero Anti-Pattern List

- [x] Zero em-dashes (`—`) in copy or code.
- [x] Zero emojis in UI controls, code, or comments.
- [x] Zero meta-labels ("SECTION 01", "QUESTION 05").
- [x] Zero fake-precise metrics (e.g. `42,109`).
- [x] Zero edge-to-edge sticky headers glued to the top.
