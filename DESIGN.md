# Design System: ZkPay Global 3D Protocol

## 1. Visual Theme & Atmosphere
A gallery-airy, interconnected 3D spatial interface engineered with precision-instrument metallurgy and fluid spring-physics choreography. The page operates as a single continuous 3D environment where a scroll-reactive geodesic globe, orbital currency rings, and Z-axis perspective monoliths are linked by a live kinetic conduit.

* **DESIGN_VARIANCE:** `8 / 10` (Asymmetric 7/5 split hero, Z-axis cascading steps, 7/5 + 5/7 Double-Bezel bento monoliths)
* **MOTION_INTENSITY:** `8 / 10` (Continuous 60fps 3D canvas projection linked to `useScroll()`, `preserve-3d` multi-layer parallax cards via `useMotionValue`, scroll-drawn SVG energy conduit)
* **VISUAL_DENSITY:** `3 / 10` (Generous macro-whitespace `py-24` to `py-36`, crisp informational storytelling, zero app-form clutter)

---

## 2. Color Palette & Roles
- **Obsidian Void** (`#0e0e0f`) - Primary deep canvas and inner Doppelrand hardware cores (never pure `#000000`)
- **Smoked Graphite** (`#131315`) - Elevated containers, floating navigation island, and structural plates
- **Machined Charcoal** (`#1b1b1d`) - Secondary surface elevation and recessed badge wells
- **Lunar Off-White** (`#e5e2e3`) - Primary display headlines and high-contrast values
- **Atmospheric Silver** (`#c6c6cd`) - Lead subheadings and primary narrative copy
- **Muted Steel** (`#909097`) - Secondary descriptions (`max-w-[65ch]`) and technical metadata
- **Whisper Rim** (`rgba(229, 226, 227, 0.10)`) - 1px structural hairline borders and concentric shell outlines
- **Brushed Periwinkle Steel** (`#c0c6de`) - Single locked primary accent (saturation < 80%) for CTAs, 3D orbital vectors, and focus highlights
- **Cryptographic Emerald** (`#34d399`) - Semantic settlement finality and live network pulse indicator

---

## 3. Typography Rules
- **Display & Headlines:** `Wix Madefor Display` / `Outfit` - Track-tight (`-0.025em`), controlled leading (`1.06`), sentence-case hierarchy with inline visual pills in the hero.
- **Body Copy:** `Wix Madefor Text` / `Outfit` - Relaxed leading (`1.6`), strict `65ch` maximum line width.
- **Monospace Telemetry:** `JetBrains Mono` (`tabular-nums`) - Strictly for settlement latencies, currency codes, APY percentages, and verified contract addresses.
- **Banned Fonts:** `Inter`, `Roboto`, `Arial`, and default serif fonts (`Fraunces`, `Instrument Serif`).

---

## 4. Component Stylings & 3D Architecture
* **Double-Bezel (Doppelrand) Enclosures:** All monoliths use an outer shell (`p-1.5 sm:p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5`) housing a recessed inner core (`rounded-[calc(2rem-0.375rem)] bg-[#0e0e0f] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]`).
* **3D Multi-Layer Parallax (`preserve-3d`):** Cards track pointer coordinates via `useMotionValue` and `useSpring` (`stiffness: 120, damping: 20`), elevating foreground badges at `translateZ(30px)` to `translateZ(60px)` with dynamic specular surface sheen.
* **Button-in-Button CTA Architecture:** Primary action uses a single unified label (`"Launch App"`) in a full pill (`rounded-full`) with a flush circular trailing icon housing that translates diagonally on hover and scales to `0.98` on active press.

---

## 5. Layout Principles & Responsive Strategy
- **Hero Discipline:** 7/5 asymmetric split fitting 100% inside `min-h-[100dvh]` with `pt-20 lg:pt-24` top padding cap and 4 stack elements.
- **Eyebrow Cap:** Maximum 2 eyebrows across all 6 page sections (`<= ceil(6 / 3)`).
- **Non-Repeating Section Layouts:**
  1. Asymmetric 7/5 3D Split Hero
  2. Single-Row Architectural Global Currency Rail
  3. 3-Node Z-Axis Cascading Spatial Flow
  4. 4-Cell Asymmetric (7/5 + 5/7) Bento 2.0 Monoliths
  5. 5/7 Split Interactive 360° 3D Titanium Card Showcase
  6. Full-Width Horizon Convergence & Minimalist Footer
- **Mobile-First Collapse (`< 768px`):** All multi-column and 3D offset grids collapse cleanly to `grid-cols-1 w-full px-4` with zero horizontal overflow.

---

## 6. Motion & Interconnected Choreography
- **Global 3D Spatial Canvas:** Fixed `<canvas>` renders a 3D geodesic globe and orbital currency rings whose rotation, camera tilt, and Z-depth interpolate smoothly with `useScroll()`.
- **Scroll-Scrubbed Conduit Spine:** An SVG vector path draws down the vertical axis of the page as the user scrolls, linking each section into a single continuous narrative.
- **Reduced Motion Guardrail:** Every continuous loop, 3D tilt transform, and scroll-linked animation checks `useReducedMotion()` and degrades gracefully to a poised static presentation.

---

## 7. Anti-Patterns (Banned)
- Zero em-dashes (`—`) or en-dashes (`–`) anywhere in markup, strings, or comments.
- Zero emojis anywhere.
- Zero duplicate CTA intents (only `"Launch App"` is used for app entry).
- Zero in-app form inputs, converter calculators, or fake waitlist counters on the marketing page.
- Zero AI-purple neon glows or pure `#000000` backgrounds.
