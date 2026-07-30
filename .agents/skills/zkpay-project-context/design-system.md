---
name: Obsidian Glass
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1b1b1d'
  surface-container: '#201f21'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#c6c6cd'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#303032'
  outline: '#909097'
  outline-variant: '#46464c'
  surface-tint: '#c0c6de'
  primary: '#c0c6de'
  on-primary: '#2a3043'
  primary-container: '#020617'
  on-primary-container: '#72778d'
  inverse-primary: '#585e73'
  secondary: '#bcc7de'
  on-secondary: '#263143'
  secondary-container: '#3e495d'
  on-secondary-container: '#aeb9d0'
  tertiary: '#b9c7e0'
  on-tertiary: '#233144'
  tertiary-container: '#000715'
  on-tertiary-container: '#6b798f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dce1fb'
  primary-fixed-dim: '#c0c6de'
  on-primary-fixed: '#151b2d'
  on-primary-fixed-variant: '#40465a'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#d5e3fd'
  tertiary-fixed-dim: '#b9c7e0'
  on-tertiary-fixed: '#0d1c2f'
  on-tertiary-fixed-variant: '#3a485c'
  background: '#131315'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  display-xl:
    fontFamily: Hanken Grotesk
    fontSize: 80px
    fontWeight: '800'
    lineHeight: 88px
    letterSpacing: -0.04em
  display-xl-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is defined by an uncompromising "Luxury Editorial" aesthetic, tailored for a high-net-worth audience interacting with crypto-to-fiat transactions. It blends the structural authority of a financial institution with the avant-garde elegance of a high-end fashion magazine.

The style is a sophisticated evolution of **Glassmorphism**, set against a **Minimalist** backdrop of deep, infinite blues. We move away from standard UI patterns in favor of an **Asymmetric Layout** that emphasizes editorial hierarchy. The emotional response should be one of "Quiet Luxury"—it feels elite, secure, and intentionally spacious.

- **Primary Motif:** Translucent "Frosted Glass" panes layered over a deep, dark "Midnight Blue" canvas.
- **Tone:** Professional, elite, and secure.
- **Visual Language:** High-contrast typography, heavy use of "bluespace" (the dark variant of whitespace), and razor-sharp silver accents.

## Layout & Spacing

The layout philosophy is **Asymmetric Fluid**. We avoid centered hero sections entirely. Content is weighted toward the left or right to create dynamic visual interest.

- **Margins:** Generous 64px external margins on desktop to allow the "Midnight Blue" to breathe.
- **Asymmetry:** Key elements (like card totals or primary headlines) should be offset from the standard grid lines by the `asymmetric-offset` to create a boutique, non-standard feel.
- **Responsibility:** On mobile, asymmetry is reduced to a standard 24px margin, but typography remains large to maintain the brand's bold voice.

## Elevation & Depth

Depth is not communicated via shadows, but through **Tonal Opacity** and **Backdrop Blurs**.

- **Surface 1 (Base):** Midnight Blue solid background.
- **Surface 2 (Cards):** 3% white fill, 40px backdrop blur, 1px "Silver" border at 10% opacity.
- **Surface 3 (Modals/Popovers):** 6% white fill, 60px backdrop blur, 1px "Silver" border at 20% opacity.

The goal is to make elements look like thick, translucent slabs of obsidian glass. Avoid all drop shadows; if an element needs to "pop," increase the stroke weight of the silver border slightly or increase the background blur intensity.

## Components

### Buttons
- **Primary:** Solid Silver (#E2E8F0) with dark navy text. No border. High contrast.
- **Secondary:** Ghost style. 1px Silver border (20% opacity) with white text. Blurs the background behind the button.
- **Text:** Sapphire blue, bold, with a small silver arrow icon (→).

### Cards
All cards must use the frosted glass treatment. They should never have a solid background. Headers within cards should use the "Label-caps" typography style.

### Input Fields
Inputs are minimal: a single bottom border in Silver (30% opacity). When focused, the border becomes Sapphire, and a subtle glass glow appears behind the input field.

### Lists
Transaction lists should have high vertical padding (24px) between items. Use subtle 1px dividers that fade out toward the edges of the container.

### Chips/Tags
Small, rectangular tags with 2px radius. Dark background with Sapphire text for "Crypto" statuses; Dark background with Silver text for "Fiat" statuses.

## Finalized Screen Flow (Stitch UI)

Below is the documented flow of screens selected during the design phase. All screens utilize the Obsidian Glass aesthetic.

*   **Landing Page**: [The Glass Wallet](https://stitch.withgoogle.com/preview/10727706339367747078?node-id=9f0461d5f9654572aa1dbb507d6bbdbb)
*   **Scan and Pay Scanner**: [Immersive Glass HUD Scanner](https://stitch.withgoogle.com/preview/10727706339367747078?node-id=b2d884e3b85349b58babe2cad84eeeb5)
*   **Payment Amount**: [Send Payment](https://stitch.withgoogle.com/preview/10727706339367747078?node-id=99f52e68a2c44fafbb2298dcb2197a02)
*   **Payment Success**: "Variant 2" from the generated set (Minimalist Typographical Success).
*   **Cashout (USDC to INR)**: [Offramp Cashout Flow](https://stitch.withgoogle.com/preview/10727706339367747078?node-id=6236381d049b42a2b280346c0135b2b9)
*   **Earn / Vault**: [Earn Vault UI](https://stitch.withgoogle.com/preview/10727706339367747078?node-id=6be9ea0d37604a45a5b1d5ba257d6092)
