"use client";

import React, { useEffect, useRef, memo } from "react";
import { MotionValue, useReducedMotion } from "framer-motion";

interface SpatialCanvas3DProps {
  scrollProgress?: MotionValue<number>;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
  isHub?: boolean;
  label?: string;
}

interface OrbitalPacket {
  ringIndex: number;
  angle: number;
  speed: number;
  radius: number;
  tiltX: number;
  tiltZ: number;
  code: string;
  emerald: boolean;
}

const CURRENCY_HUBS = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "BRL",
  "JPY",
  "AED",
  "SGD",
  "CHF",
  "MXN",
  "AUD",
  "CAD",
];

function SpatialCanvas3DComponent({ scrollProgress }: SpatialCanvas3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Generate Fibonacci 3D sphere vertices
    const numPoints = 110;
    const spherePoints: Vec3[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      const isHub = i % 9 === 0 && Math.floor(i / 9) < CURRENCY_HUBS.length;
      spherePoints.push({
        x,
        y,
        z,
        isHub,
        label: isHub ? CURRENCY_HUBS[Math.floor(i / 9)] : undefined,
      });
    }

    // Generate 3D Orbital Currency Rings
    const packets: OrbitalPacket[] = [
      { ringIndex: 0, angle: 0.2, speed: 0.006, radius: 1.38, tiltX: 0.52, tiltZ: -0.28, code: "USD · FEDNOW", emerald: true },
      { ringIndex: 0, angle: 2.3, speed: 0.006, radius: 1.38, tiltX: 0.52, tiltZ: -0.28, code: "EUR · SEPA", emerald: false },
      { ringIndex: 0, angle: 4.4, speed: 0.006, radius: 1.38, tiltX: 0.52, tiltZ: -0.28, code: "GBP · FASTER", emerald: false },
      { ringIndex: 1, angle: 1.1, speed: -0.005, radius: 1.62, tiltX: -0.48, tiltZ: 0.42, code: "INR · UPI", emerald: true },
      { ringIndex: 1, angle: 3.2, speed: -0.005, radius: 1.62, tiltX: -0.48, tiltZ: 0.42, code: "BRL · PIX", emerald: true },
      { ringIndex: 1, angle: 5.3, speed: -0.005, radius: 1.62, tiltX: -0.48, tiltZ: 0.42, code: "JPY · ZENGIN", emerald: false },
      { ringIndex: 2, angle: 0.7, speed: 0.004, radius: 1.86, tiltX: 1.05, tiltZ: 0.18, code: "SGD · PAYNOW", emerald: false },
      { ringIndex: 2, angle: 3.8, speed: 0.004, radius: 1.86, tiltX: 1.05, tiltZ: 0.18, code: "AED · IPP", emerald: false },
    ];

    // Pointer tracking in ref (zero React re-renders)
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      pointer.targetX = (e.clientX / Math.max(width, 1) - 0.5) * 2;
      pointer.targetY = (e.clientY / Math.max(height, 1) - 0.5) * 2;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    let baseRotationY = 0;

    // 3D rotation helper
    const rotate3D = (p: { x: number; y: number; z: number }, rx: number, ry: number, rz: number) => {
      // Rotate Y
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.z * cosY + p.x * sinY;

      // Rotate X
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + p.y * sinX;

      // Rotate Z
      const cosZ = Math.cos(rz);
      const sinZ = Math.sin(rz);
      const x3 = x1 * cosZ - y2 * sinZ;
      const y3 = y2 * cosZ + x1 * sinZ;

      return { x: x3, y: y3, z: z2 };
    };

    const renderFrame = () => {
      ctx.clearRect(0, 0, width, height);

      const s = scrollProgress ? scrollProgress.get() : 0.35; // 0 to 1 across entire website
      pointer.x += (pointer.targetX - pointer.x) * 0.05;
      pointer.y += (pointer.targetY - pointer.y) * 0.05;

      if (!shouldReduceMotion) {
        baseRotationY += 0.0032;
      }

      // Interpolate 3D Globe position and scale across page sections so all parts feel connected
      const isMobile = width < 768;
      let centerX = width * 0.5;
      let centerY = height * 0.5;
      let radiusScale = 1;

      if (isMobile) {
        centerX = width * 0.5;
        centerY = height * (0.42 + Math.sin(s * Math.PI) * 0.08);
        radiusScale = 0.85 + Math.sin(s * Math.PI) * 0.15;
      } else {
        if (s < 0.22) {
          // Section 1 (Hero): Positioned on right 7/5 split stage
          const t = s / 0.22;
          centerX = width * (0.71 - t * 0.21);
          centerY = height * (0.48 + t * 0.04);
          radiusScale = 1.0 + t * 0.18;
        } else if (s < 0.55) {
          // Section 2 & 3 (Global Corridors & 3-Step Z-Axis Cascade): Centered wide orbital field
          const t = (s - 0.22) / 0.33;
          centerX = width * (0.5 - Math.sin(t * Math.PI) * 0.12);
          centerY = height * 0.52;
          radiusScale = 1.18 + Math.sin(t * Math.PI) * 0.16;
        } else if (s < 0.82) {
          // Section 4 & 5 (3D Monoliths & Obsidian Card): Offset spatial anchor
          const t = (s - 0.55) / 0.27;
          centerX = width * (0.36 + t * 0.14);
          centerY = height * 0.5;
          radiusScale = 1.15 - t * 0.1;
        } else {
          // Section 6 (Closing Horizon): Centered planetary convergence
          centerX = width * 0.5;
          centerY = height * 0.54;
          radiusScale = 1.12;
        }
      }

      const baseRadius = Math.min(width, height) * (isMobile ? 0.31 : 0.24) * radiusScale;
      const fov = 620;

      // Scroll-linked 3D rotation angles + pointer parallax
      const rotY = baseRotationY + s * Math.PI * 2.2 + pointer.x * 0.38;
      const rotX = 0.28 + Math.sin(s * Math.PI * 1.5) * 0.42 + pointer.y * 0.28;
      const rotZ = Math.cos(s * Math.PI) * 0.18;

      // Subtle atmospheric core luminance (Electric Blue + Acid Lime)
      const coreGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.05,
        centerX,
        centerY,
        baseRadius * 1.85
      );
      coreGlow.addColorStop(0, "rgba(41, 112, 255, 0.14)");
      coreGlow.addColorStop(0.45, "rgba(204, 255, 0, 0.04)");
      coreGlow.addColorStop(1, "rgba(5, 6, 8, 0)");
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 1.85, 0, Math.PI * 2);
      ctx.fill();

      // 1. Render 3 inclined 3D Orbital Rings
      const ringConfigs = [
        { radius: 1.38, tiltX: 0.52, tiltZ: -0.28, stroke: "rgba(41, 112, 255, 0.24)" },
        { radius: 1.62, tiltX: -0.48, tiltZ: 0.42, stroke: "rgba(204, 255, 0, 0.20)" },
        { radius: 1.86, tiltX: 1.05, tiltZ: 0.18, stroke: "rgba(41, 112, 255, 0.14)" },
      ];

      ringConfigs.forEach((ring) => {
        ctx.beginPath();
        const steps = 72;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const raw = {
            x: Math.cos(theta) * ring.radius,
            y: 0,
            z: Math.sin(theta) * ring.radius,
          };
          const tilted = rotate3D(raw, ring.tiltX + rotX * 0.5, rotY * 0.6, ring.tiltZ + rotZ);
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

      // 2. Project 3D Geodesic Sphere Vertices
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
        };
      });

      // Draw 3D constellation connections between nearby front-facing vertices
      ctx.lineWidth = 0.75;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        if (a.z < -0.35) continue;
        for (let j = i + 1; j < Math.min(i + 12, projected.length); j++) {
          const b = projected[j];
          if (b.z < -0.35) continue;
          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          const distSq = dx * dx + dy * dy;
          const maxDist = baseRadius * 0.36;
          if (distSq < maxDist * maxDist) {
            const alpha = (1 - Math.sqrt(distSq) / maxDist) * 0.24 * ((a.z + 1) * 0.5);
            ctx.strokeStyle = `rgba(41, 112, 255, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // Draw Sphere Nodes & Currency Hubs
      projected.forEach((p) => {
        const depthAlpha = Math.max(0.08, (p.z + 1.1) * 0.45);
        if (p.isHub && p.z > -0.1) {
          ctx.fillStyle = `rgba(204, 255, 0, ${Math.min(0.95, depthAlpha + 0.3)})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 2.6 * p.scale, 0, Math.PI * 2);
          ctx.fill();

          if (p.label && p.z > 0.22 && !isMobile) {
            ctx.font = "500 10px 'JetBrains Mono', monospace";
            ctx.fillStyle = `rgba(248, 250, 252, ${(depthAlpha * 0.85).toFixed(2)})`;
            ctx.fillText(p.label, p.sx + 7, p.sy + 3);
          }
        } else {
          ctx.fillStyle = `rgba(41, 112, 255, ${(depthAlpha * 0.65).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 1.35 * p.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 3. Render Orbiting Currency Telemetry Nodes
      packets.forEach((pkt) => {
        if (!shouldReduceMotion) {
          pkt.angle += pkt.speed;
        }
        const raw = {
          x: Math.cos(pkt.angle) * pkt.radius,
          y: 0,
          z: Math.sin(pkt.angle) * pkt.radius,
        };
        const tilted = rotate3D(raw, pkt.tiltX + rotX * 0.5, rotY * 0.6, pkt.tiltZ + rotZ);
        const worldZ = tilted.z * baseRadius;
        const scale = fov / (fov + worldZ + 220);
        const sx = centerX + tilted.x * baseRadius * scale;
        const sy = centerY + tilted.y * baseRadius * scale;
        const alpha = Math.max(0.18, (tilted.z + 1.4) * 0.38);

        ctx.fillStyle = pkt.emerald
          ? `rgba(204, 255, 0, ${Math.min(0.95, alpha + 0.25)})`
          : `rgba(41, 112, 255, ${Math.min(0.95, alpha + 0.2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2 * scale, 0, Math.PI * 2);
        ctx.fill();

        if (!isMobile && tilted.z > -0.2) {
          ctx.font = "500 9.5px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(248, 250, 252, ${(alpha * 0.82).toFixed(2)})`;
          ctx.fillText(pkt.code, sx + 8, sy + 3);
        }
      });

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
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
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

export const SpatialCanvas3D = memo(SpatialCanvas3DComponent);
