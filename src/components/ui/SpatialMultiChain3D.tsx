"use client";

import React, { useEffect, useRef, memo } from "react";
import { MotionValue, useReducedMotion } from "framer-motion";

interface SpatialMultiChain3DProps {
  scrollProgress?: MotionValue<number>;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
  isHub?: boolean;
  label?: string;
  color?: string;
}

interface OrbitalPacket {
  ringIndex: number;
  angle: number;
  speed: number;
  radius: number;
  tiltX: number;
  tiltZ: number;
  code: string;
  isAccent: boolean;
}

const CHAIN_HUBS = [
  { code: "BTC", color: "#F7931A" },
  { code: "ETH", color: "#627EEA" },
  { code: "SOL", color: "#14F195" },
  { code: "BASE", color: "#2970FF" },
  { code: "ARB", color: "#28A0F0" },
  { code: "POL", color: "#8247E5" },
  { code: "BSC", color: "#F3BA2F" },
  { code: "TRX", color: "#FF0013" },
  { code: "LTC", color: "#345D9D" },
];

function SpatialMultiChain3DComponent({ scrollProgress }: SpatialMultiChain3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let isVisible = true;

    const resize = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.5 : 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Generate Fibonacci 3D geodesic sphere vertices
    const isMobile = width < 768;
    const numPoints = isMobile ? 80 : 120;
    const spherePoints: Vec3[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      const isHub = i % 9 === 0 && Math.floor(i / 9) < CHAIN_HUBS.length;
      const hubData = isHub ? CHAIN_HUBS[Math.floor(i / 9)] : undefined;
      spherePoints.push({
        x,
        y,
        z,
        isHub,
        label: hubData?.code,
        color: hubData?.color,
      });
    }

    // 3 Dynamic Inclined Multi-Chain Orbital Rings
    const packets: OrbitalPacket[] = [
      { ringIndex: 0, angle: 0.3, speed: 0.007, radius: 1.35, tiltX: 0.48, tiltZ: -0.25, code: "SOL → BASE", isAccent: true },
      { ringIndex: 0, angle: 2.4, speed: 0.007, radius: 1.35, tiltX: 0.48, tiltZ: -0.25, code: "ETH → ARB", isAccent: false },
      { ringIndex: 0, angle: 4.5, speed: 0.007, radius: 1.35, tiltX: 0.48, tiltZ: -0.25, code: "BASE → POL", isAccent: false },
      { ringIndex: 1, angle: 1.2, speed: -0.006, radius: 1.60, tiltX: -0.42, tiltZ: 0.38, code: "BTC → TRX", isAccent: true },
      { ringIndex: 1, angle: 3.3, speed: -0.006, radius: 1.60, tiltX: -0.42, tiltZ: 0.38, code: "LTC → BASE", isAccent: false },
      { ringIndex: 1, angle: 5.4, speed: -0.006, radius: 1.60, tiltX: -0.42, tiltZ: 0.38, code: "BSC → ETH", isAccent: false },
      { ringIndex: 2, angle: 0.8, speed: 0.005, radius: 1.84, tiltX: 0.95, tiltZ: 0.16, code: "SOL → TRX", isAccent: false },
      { ringIndex: 2, angle: 3.9, speed: 0.005, radius: 1.84, tiltX: 0.95, tiltZ: 0.16, code: "BTC → BASE", isAccent: true },
    ];

    // Hub to hub cross-chain swap arcs (comet particles travelling along lifted bezier curves)
    const swapArcs = [
      { from: "SOL", to: "BASE", t: 0.0, speed: 0.0055, accent: true },
      { from: "BTC", to: "ETH", t: 0.35, speed: 0.0042, accent: false },
      { from: "TRX", to: "BASE", t: 0.62, speed: 0.005, accent: true },
      { from: "LTC", to: "POL", t: 0.18, speed: 0.0047, accent: false },
      { from: "ETH", to: "SOL", t: 0.8, speed: 0.0051, accent: false },
      { from: "BSC", to: "ARB", t: 0.5, speed: 0.0045, accent: true },
    ];

    // Deep parallax starfield
    const stars = Array.from({ length: isMobile ? 70 : 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      depth: 0.2 + Math.random() * 0.8,
      twinkle: Math.random() * Math.PI * 2,
    }));

    // Pointer tracking with inertia
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      pointer.targetX = (clientX / Math.max(width, 1) - 0.5) * 2;
      pointer.targetY = (clientY / Math.max(height, 1) - 0.5) * 2;
    };
    // Mobile gyro tilt (Android and permission-granted iOS)
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      pointer.targetX = Math.max(-1, Math.min(1, e.gamma / 30));
      pointer.targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });
    if (!shouldReduceMotion) {
      window.addEventListener("deviceorientation", handleOrientation, { passive: true });
    }

    // IntersectionObserver to sleep when canvas is not visible
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    observer.observe(canvas);

    let baseRotationY = 0;

    // 3D Matrix Rotation Helper
    const rotate3D = (p: { x: number; y: number; z: number }, rx: number, ry: number, rz: number) => {
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.z * cosY + p.x * sinY;

      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + p.y * sinX;

      const cosZ = Math.cos(rz);
      const sinZ = Math.sin(rz);
      const x3 = x1 * cosZ - y2 * sinZ;
      const y3 = y2 * cosZ + x1 * sinZ;

      return { x: x3, y: y3, z: z2 };
    };

    const ringConfigs = [
      { radius: 1.35, tiltX: 0.48, tiltZ: -0.25, stroke: "rgba(41, 112, 255, 0.28)" },
      { radius: 1.60, tiltX: -0.42, tiltZ: 0.38, stroke: "rgba(204, 255, 0, 0.22)" },
      { radius: 1.84, tiltX: 0.95, tiltZ: 0.16, stroke: "rgba(41, 112, 255, 0.18)" },
    ];

    const renderFrame = () => {
      if (!isVisible || document.hidden) {
        if (!shouldReduceMotion) {
          animationFrameId = requestAnimationFrame(renderFrame);
        }
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const s = scrollProgress ? scrollProgress.get() : 0.05; // 0 to 1 across website
      pointer.x += (pointer.targetX - pointer.x) * 0.05;
      pointer.y += (pointer.targetY - pointer.y) * 0.05;

      if (!shouldReduceMotion) {
        baseRotationY += 0.0028;
      }

      // Smooth scroll choreography for camera position and scale
      const mobile = width < 768;
      let centerX = width * 0.5;
      let centerY = height * 0.5;
      let radiusScale = 1;

      if (mobile) {
        centerX = width * 0.5;
        centerY = height * (0.38 + Math.sin(s * Math.PI) * 0.06);
        radiusScale = 0.88 + Math.sin(s * Math.PI) * 0.14;
      } else {
        if (s < 0.24) {
          // Hero section: framed dynamically behind/beside SwapWidget on the right
          const t = s / 0.24;
          centerX = width * (0.68 - t * 0.18);
          centerY = height * (0.46 + t * 0.04);
          radiusScale = 1.05 + t * 0.15;
        } else if (s < 0.55) {
          // Route Matrix & Architecture: centered spatial orbit
          const t = (s - 0.24) / 0.31;
          centerX = width * (0.5 - Math.sin(t * Math.PI) * 0.1);
          centerY = height * 0.5;
          radiusScale = 1.2 + Math.sin(t * Math.PI) * 0.12;
        } else if (s < 0.82) {
          // Revenue Engine & Dev API: tilted perspective anchor
          const t = (s - 0.55) / 0.27;
          centerX = width * (0.38 + t * 0.12);
          centerY = height * 0.52;
          radiusScale = 1.14 - t * 0.08;
        } else {
          // Closing Horizon
          centerX = width * 0.5;
          centerY = height * 0.54;
          radiusScale = 1.08;
        }
      }

      const baseRadius = Math.min(width, height) * (mobile ? 0.30 : 0.25) * radiusScale;
      const fov = 640;

      // Scroll-linked rotation angles + pointer inertia
      const rotY = baseRotationY + s * Math.PI * 2.4 + pointer.x * 0.35;
      const rotX = 0.24 + Math.sin(s * Math.PI * 1.6) * 0.38 + pointer.y * 0.25;
      const rotZ = Math.cos(s * Math.PI) * 0.15;

      // 0. Parallax starfield
      const timeNow = performance.now() * 0.001;
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        const sx = ((st.x + 1 + pointer.x * 0.015 * st.depth) % 1) * width;
        const sy = ((st.y + 2 - ((s * 0.25 * st.depth) % 1) + pointer.y * 0.015 * st.depth) % 1) * height;
        const tw = shouldReduceMotion ? 0.6 : 0.45 + Math.sin(timeNow * 1.4 + st.twinkle) * 0.3;
        ctx.globalAlpha = tw * st.depth * 0.55;
        ctx.fillStyle = st.depth > 0.85 ? "#CCFF00" : "#9EC0FF";
        ctx.fillRect(sx, sy, st.depth * 1.4, st.depth * 1.4);
      }
      ctx.globalAlpha = 1;

      // 1. Ambient Volumetric Atmospheric Core Glow (Electric Blue + Acid Lime)
      const coreGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.06,
        centerX,
        centerY,
        baseRadius * 1.8
      );
      coreGlow.addColorStop(0, "rgba(41, 112, 255, 0.16)");
      coreGlow.addColorStop(0.4, "rgba(204, 255, 0, 0.04)");
      coreGlow.addColorStop(1, "rgba(5, 6, 8, 0)");
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // 2. Render 3 Inclined Orbital Multi-Chain Rails
      ringConfigs.forEach((ring) => {
        ctx.beginPath();
        const steps = mobile ? 48 : 72;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const raw = {
            x: Math.cos(theta) * ring.radius,
            y: 0,
            z: Math.sin(theta) * ring.radius,
          };
          const tilted = rotate3D(raw, ring.tiltX + rotX * 0.5, rotY * 0.65, ring.tiltZ + rotZ);
          const worldZ = tilted.z * baseRadius;
          const scale = fov / (fov + worldZ + 220);
          const sx = centerX + tilted.x * baseRadius * scale;
          const sy = centerY + tilted.y * baseRadius * scale;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = ring.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // 3. Project 3D Geodesic Fibonacci Vertices
      const projected = spherePoints.map((pt) => {
        const r = rotate3D(pt, rotX, rotY, rotZ);
        const worldZ = r.z * baseRadius;
        const scale = fov / (fov + worldZ + 220);
        return {
          sx: centerX + r.x * baseRadius * scale,
          sy: centerY + r.y * baseRadius * scale,
          z: r.z,
          scale,
          isHub: pt.isHub,
          label: pt.label,
          color: pt.color,
        };
      });

      // 4. Constellation Filaments Between Front-Facing Nodes
      ctx.lineWidth = 0.75;
      const maxFilamentDist = baseRadius * 0.38;
      const maxDistSq = maxFilamentDist * maxFilamentDist;
      const len = projected.length;
      for (let i = 0; i < len; i++) {
        const a = projected[i];
        if (a.z < -0.3) continue;
        const limit = Math.min(i + (mobile ? 6 : 10), len);
        for (let j = i + 1; j < limit; j++) {
          const b = projected[j];
          if (b.z < -0.3) continue;
          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          const distSq = dx * dx + dy * dy;
          if (distSq < maxDistSq) {
            const alpha = (1 - Math.sqrt(distSq) / maxFilamentDist) * 0.22 * ((a.z + 1) * 0.5);
            ctx.strokeStyle = `rgba(41, 112, 255, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // 5. Draw Geodesic Nodes & 9 Blockchain Anchor Hubs
      projected.forEach((p) => {
        const depthAlpha = Math.max(0.08, (p.z + 1.1) * 0.45);
        if (p.isHub && p.z > -0.15) {
          // Distinct Hub Accent Glow
          const hubColor = p.color || "#CCFF00";
          ctx.fillStyle = hubColor;
          ctx.globalAlpha = Math.min(0.95, depthAlpha + 0.35);
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 3 * p.scale, 0, Math.PI * 2);
          ctx.fill();

          // Hub Label (Crisp JetBrains Mono)
          if (p.label && p.z > 0.18 && !mobile) {
            ctx.font = "600 10px 'JetBrains Mono', monospace";
            ctx.fillStyle = "#F8FAFC";
            ctx.globalAlpha = Math.min(0.9, depthAlpha * 0.9);
            ctx.fillText(p.label, p.sx + 8, p.sy + 3.5);
          }
        } else {
          // Subtle Electric Blue Grid Node
          ctx.fillStyle = "#2970FF";
          ctx.globalAlpha = Math.min(0.65, depthAlpha * 0.6);
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 1.35 * p.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      // 5b. Hub to hub swap arcs with comet trails
      const hubMap: Record<string, (typeof projected)[number]> = {};
      projected.forEach((p) => {
        if (p.isHub && p.label) hubMap[p.label] = p;
      });
      swapArcs.forEach((arc) => {
        const a = hubMap[arc.from];
        const b = hubMap[arc.to];
        if (!a || !b) return;
        if (!shouldReduceMotion) {
          arc.t += arc.speed;
          if (arc.t > 1) arc.t = 0;
        }
        const visibility = Math.min(1, Math.max(0, (Math.min(a.z, b.z) + 0.35) * 1.6));
        if (visibility <= 0.02) return;

        // Control point lifted outward from the globe center
        const mx = (a.sx + b.sx) / 2;
        const my = (a.sy + b.sy) / 2;
        const cx = centerX + (mx - centerX) * 1.9;
        const cy = centerY + (my - centerY) * 1.9 - baseRadius * 0.15;

        // Faint arc path
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(cx, cy, b.sx, b.sy);
        ctx.strokeStyle = arc.accent
          ? `rgba(204, 255, 0, ${(0.16 * visibility).toFixed(3)})`
          : `rgba(41, 112, 255, ${(0.22 * visibility).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Comet head and fading tail
        const tailSteps = mobile ? 6 : 10;
        for (let k = 0; k < tailSteps; k++) {
          const tt = arc.t - k * 0.018;
          if (tt < 0) break;
          const inv = 1 - tt;
          const px = inv * inv * a.sx + 2 * inv * tt * cx + tt * tt * b.sx;
          const py = inv * inv * a.sy + 2 * inv * tt * cy + tt * tt * b.sy;
          const fade = 1 - k / tailSteps;
          ctx.globalAlpha = fade * visibility * 0.9;
          ctx.fillStyle = arc.accent ? "#CCFF00" : "#528BFF";
          ctx.beginPath();
          ctx.arc(px, py, (k === 0 ? 2.6 : 1.8) * fade + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });

      // 6. Traveling Multi-Chain Orbital Intent Packets
      packets.forEach((pkt) => {
        if (!shouldReduceMotion) {
          pkt.angle += pkt.speed;
        }
        const raw = {
          x: Math.cos(pkt.angle) * pkt.radius,
          y: 0,
          z: Math.sin(pkt.angle) * pkt.radius,
        };
        const tilted = rotate3D(raw, pkt.tiltX + rotX * 0.5, rotY * 0.65, pkt.tiltZ + rotZ);
        const worldZ = tilted.z * baseRadius;
        const scale = fov / (fov + worldZ + 220);
        const sx = centerX + tilted.x * baseRadius * scale;
        const sy = centerY + tilted.y * baseRadius * scale;
        const alpha = Math.max(0.18, (tilted.z + 1.4) * 0.38);

        ctx.fillStyle = pkt.isAccent ? "#CCFF00" : "#2970FF";
        ctx.globalAlpha = Math.min(0.95, alpha + 0.25);
        ctx.beginPath();
        ctx.arc(sx, sy, 3.4 * scale, 0, Math.PI * 2);
        ctx.fill();

        if (!mobile && tilted.z > -0.15) {
          ctx.font = "500 9.5px 'JetBrains Mono', monospace";
          ctx.fillStyle = "#F8FAFC";
          ctx.globalAlpha = Math.min(0.85, alpha * 0.85);
          ctx.fillText(pkt.code, sx + 9, sy + 3);
        }
      });
      ctx.globalAlpha = 1;

      if (!shouldReduceMotion) {
        animationFrameId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    const unsubscribeScroll = scrollProgress?.on("change", () => {
      if (shouldReduceMotion) {
        renderFrame();
      }
    });

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      unsubscribeScroll?.();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [scrollProgress, shouldReduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}

export const SpatialMultiChain3D = memo(SpatialMultiChain3DComponent);
