"use client";

import React, { useEffect, useRef, memo } from "react";
import { useReducedMotion } from "framer-motion";

interface Node3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  label: string;
  color: string;
  radius: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitElevation: number;
}

interface Packet3D {
  sourceIdx: number;
  targetIdx: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

const CHAIN_NODES_DATA: Array<{ label: string; color: string; orbitRadius: number; elevation: number; speed: number }> = [
  { label: "BTC", color: "#F7931A", orbitRadius: 280, elevation: 60, speed: 0.0006 },
  { label: "ETH", color: "#627EEA", orbitRadius: 240, elevation: -50, speed: -0.0007 },
  { label: "SOL", color: "#14F195", orbitRadius: 300, elevation: 40, speed: 0.0008 },
  { label: "BASE", color: "#2970FF", orbitRadius: 210, elevation: -20, speed: -0.0009 },
  { label: "ARB", color: "#28A0F0", orbitRadius: 260, elevation: 70, speed: 0.0007 },
  { label: "POLYGON", color: "#8247E5", orbitRadius: 270, elevation: -70, speed: -0.0008 },
  { label: "BSC", color: "#F3BA2F", orbitRadius: 250, elevation: 30, speed: 0.00065 },
  { label: "TRON", color: "#FF0013", orbitRadius: 290, elevation: -40, speed: -0.00075 },
  { label: "LTC", color: "#345D9D", orbitRadius: 220, elevation: 80, speed: 0.00085 },
];

function QuantumMesh3DComponent() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number | null = null;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0.2;
    let targetRotY = 0;
    let currentRotX = 0.2;
    let currentRotY = 0;

    let isVisible = true;

    // Initialize 3D Nodes
    const nodes: Node3D[] = CHAIN_NODES_DATA.map((data, i) => {
      const angle = (i / CHAIN_NODES_DATA.length) * Math.PI * 2;
      return {
        x: 0,
        y: 0,
        z: 0,
        baseX: Math.cos(angle) * data.orbitRadius,
        baseY: data.elevation,
        baseZ: Math.sin(angle) * data.orbitRadius,
        label: data.label,
        color: data.color,
        radius: 7,
        orbitAngle: angle,
        orbitSpeed: data.speed,
        orbitRadius: data.orbitRadius,
        orbitElevation: data.elevation,
      };
    });

    // Background stardust particles
    const starCount = 45;
    const stars: Array<{ x: number; y: number; z: number; size: number; alpha: number }> = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 1400,
        y: (Math.random() - 0.5) * 900,
        z: (Math.random() - 0.5) * 800,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }

    // Active Intent Transfer Packets
    const packets: Packet3D[] = [];
    const spawnPacket = () => {
      if (packets.length >= 8) return;
      const s = Math.floor(Math.random() * nodes.length);
      let t = Math.floor(Math.random() * nodes.length);
      if (s === t) t = (t + 1) % nodes.length;
      packets.push({
        sourceIdx: s,
        targetIdx: t,
        progress: 0,
        speed: Math.random() * 0.007 + 0.005,
        color: nodes[s].color,
        size: 3,
      });
    };

    let packetTimer = 0;

    const resize = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      mouseX = (clientX / width - 0.5) * 2;
      mouseY = (clientY / height - 0.5) * 2;
      targetRotY = mouseX * 0.4;
      targetRotX = 0.2 - mouseY * 0.3;
    };

    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });

    // Visibility observer to pause when off-screen
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    observer.observe(canvas);

    let lastTime = performance.now();

    const render = (time: number) => {
      animId = requestAnimationFrame(render);
      if (!isVisible || document.hidden) return;

      const delta = Math.min(time - lastTime, 60);
      lastTime = time;

      // Smooth camera interpolation
      currentRotX += (targetRotX - currentRotX) * 0.05;
      currentRotY += (targetRotY - currentRotY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.45;
      const fov = 650;

      const cosX = Math.cos(currentRotX);
      const sinX = Math.sin(currentRotX);
      const cosY = Math.cos(currentRotY);
      const sinY = Math.sin(currentRotY);

      // 1. Draw Starfield
      ctx.fillStyle = "#F4F7FB";
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        // Rotate around Y
        const rx = star.x * cosY - star.z * sinY;
        const rz = star.x * sinY + star.z * cosY;
        // Rotate around X
        const ry = star.y * cosX - rz * sinX;
        const finalZ = star.y * sinX + rz * cosX + 600;

        if (finalZ > 20) {
          const scale = fov / finalZ;
          const sx = cx + rx * scale;
          const sy = cy + ry * scale;
          if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) {
            ctx.globalAlpha = star.alpha * (finalZ / 1000);
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(0.5, star.size * scale), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Update Node Orbits
      const motionMult = shouldReduceMotion ? 0.2 : 1;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.orbitAngle += node.orbitSpeed * delta * motionMult;
        node.baseX = Math.cos(node.orbitAngle) * node.orbitRadius;
        node.baseZ = Math.sin(node.orbitAngle) * node.orbitRadius;

        // 3D Rotation transform
        const rx = node.baseX * cosY - node.baseZ * sinY;
        const rz = node.baseX * sinY + node.baseZ * cosY;
        const ry = node.baseY * cosX - rz * sinX;
        const finalZ = node.baseY * sinX + rz * cosX + 650;

        node.x = rx;
        node.y = ry;
        node.z = finalZ;
      }

      // 2. Draw Central Router Hub (ZkPay Solver Core)
      const coreZ = 650;
      const coreScale = fov / coreZ;
      const coreRadius = 26 * coreScale;

      // Central Hub Outer Halo
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 2.8);
      coreGrad.addColorStop(0, "rgba(41, 112, 255, 0.35)");
      coreGrad.addColorStop(0.5, "rgba(204, 255, 0, 0.12)");
      coreGrad.addColorStop(1, "rgba(5, 6, 8, 0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Central Hub Core
      ctx.fillStyle = "#0B0E14";
      ctx.strokeStyle = "rgba(41, 112, 255, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Core Inner Pulsing Dot (Acid Lime)
      const pulse = (Math.sin(time * 0.004) + 1) * 0.5;
      ctx.fillStyle = "#CCFF00";
      ctx.globalAlpha = 0.8 + pulse * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * coreScale, 0, Math.PI * 2);
      ctx.fill();

      // Central Hub Label
      ctx.fillStyle = "#F4F7FB";
      ctx.globalAlpha = 0.85;
      ctx.font = `600 ${Math.max(9, 10 * coreScale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("ZkPay CORE", cx, cy + coreRadius + 14 * coreScale);

      // 3. Draw Cross-Chain Topology Splines
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.z <= 50) continue;
        const scale = fov / node.z;
        const sx = cx + node.x * scale;
        const sy = cy + node.y * scale;

        // Spline connecting node to central hub
        ctx.strokeStyle = "rgba(41, 112, 255, 0.16)";
        ctx.lineWidth = Math.max(0.75, 1.2 * scale);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        // Cross-chain mesh connecting adjacent nodes
        const nextNode = nodes[(i + 1) % nodes.length];
        if (nextNode.z > 50) {
          const nextScale = fov / nextNode.z;
          const nsx = cx + nextNode.x * nextScale;
          const nsy = cy + nextNode.y * nextScale;
          ctx.strokeStyle = "rgba(204, 255, 0, 0.08)";
          ctx.lineWidth = 0.8 * scale;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(nsx, nsy);
          ctx.stroke();
        }
      }

      // 4. Update & Draw Packets
      packetTimer += delta;
      if (packetTimer > 850) {
        packetTimer = 0;
        spawnPacket();
      }

      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.progress += p.speed * (delta / 16) * motionMult;
        if (p.progress >= 1) {
          packets.splice(i, 1);
          continue;
        }

        const source = nodes[p.sourceIdx];
        const target = nodes[p.targetIdx];

        // Route: Source -> Hub (0..0.5) -> Target (0.5..1.0)
        let px = 0;
        let py = 0;
        let pz = 650;

        if (p.progress < 0.5) {
          const t = p.progress * 2;
          px = source.x * (1 - t);
          py = source.y * (1 - t);
          pz = source.z * (1 - t) + 650 * t;
        } else {
          const t = (p.progress - 0.5) * 2;
          px = target.x * t;
          py = target.y * t;
          pz = 650 * (1 - t) + target.z * t;
        }

        const pScale = fov / pz;
        const psx = cx + px * pScale;
        const psy = cy + py * pScale;

        // Packet glow
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(psx, psy, p.size * pScale * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(psx, psy, p.size * pScale * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Draw 3D Blockchain Nodes & Badges (sorted by Z depth)
      const sortedNodes = [...nodes].sort((a, b) => b.z - a.z);

      for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        if (node.z <= 50) continue;
        const scale = fov / node.z;
        const sx = cx + node.x * scale;
        const sy = cy + node.y * scale;
        const radius = node.radius * scale;

        // Node Glow Halo
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 3.5);
        glow.addColorStop(0, node.color + "66");
        glow.addColorStop(1, "rgba(5, 6, 8, 0)");
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Node Solid Sphere
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#0B0E14";
        ctx.strokeStyle = node.color;
        ctx.lineWidth = Math.max(1, 1.8 * scale);
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner Light Core
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Node Label Pill
        ctx.fillStyle = "#F4F7FB";
        ctx.font = `600 ${Math.max(8.5, 11 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.globalAlpha = Math.min(1, Math.max(0.4, (1200 - node.z) / 700));
        ctx.fillText(node.label, sx, sy - radius - 6 * scale);
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
      observer.disconnect();
    };
  }, [shouldReduceMotion]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-70 transition-opacity duration-1000"
      />
      {/* Subtle Cybernetic Grid overlay */}
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(41,112,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(41,112,255,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]"
      />
      {/* Vignette to smoothly transition to page elements */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-transparent to-[#050608]/80" />
    </div>
  );
}

export const QuantumMesh3D = memo(QuantumMesh3DComponent);
