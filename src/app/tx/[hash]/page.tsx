"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { getTransactionByHash, TransactionRecord } from "@/lib/history";
import { 
  ArrowLeft, 
  ExternalLink, 
  Copy, 
  Check, 
  Share2, 
  Download, 
  Store, 
  ShieldCheck, 
  CheckCircle2,
  Lock
} from "lucide-react";
import DecryptedText from "@/components/ui/DecryptedText";
import { formatUpiName } from "@/lib/p2pkit";

export default function TransactionReceipt() {
  const params = useParams();
  const router = useRouter();
  const [tx, setTx] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hash = params.hash as string;
    if (hash) {
      if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
        setLoading(false);
        return;
      }
      const record = getTransactionByHash(hash);
      setTx(record);
    }
    setLoading(false);
  }, [params.hash]);

  // Ambient Shader Background Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;

    const syncSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    window.addEventListener("resize", syncSize);
    syncSize();

    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = `attribute vec2 a_position;
    varying vec2 v_texCoord;
    void main() {
      v_texCoord = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`;

    const fs = `precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;

    void main() {
        vec2 uv = v_texCoord;
        vec2 center = vec2(0.5, 0.5);
        float dist = length(uv - center);
        
        vec3 sapphire = vec3(0.04, 0.15, 0.35);
        vec3 emerald = vec3(0.02, 0.35, 0.22);
        vec3 baseColor = mix(sapphire, emerald, 0.5);
        
        float pulse = sin(u_time * 1.5) * 0.1 + 0.9;
        float core = smoothstep(0.45 * pulse, 0.0, dist);
        
        float ring = smoothstep(0.5 * pulse, 0.48 * pulse, dist) * smoothstep(0.45 * pulse, 0.47 * pulse, dist);
        
        float n = fract(sin(dot(uv * u_time, vec2(12.9898, 78.233))) * 43758.5453);
        float particles = smoothstep(0.995, 1.0, n) * core;
        
        vec3 finalColor = baseColor * (core * 0.15 + ring + particles);
        
        gl_FragColor = vec4(finalColor, finalColor.r * 1.2);
    }`;

    const cs = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");

    const render = (t: number) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };
    render(0);

    return () => {
      window.removeEventListener("resize", syncSize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      triggerToast("Copied to clipboard!");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      triggerToast("Failed to copy");
    }
  };

  const [resolvedOrderId, setResolvedOrderId] = useState<string | null>(null);

  const isNumericOrderId = (id?: string | null) => {
    if (!id) return false;
    return /^\d+$/.test(id) && BigInt(id) > 0n && BigInt(id) < 100_000_000n;
  };

  useEffect(() => {
    if (!tx) return;
    if (tx.orderId && isNumericOrderId(tx.orderId)) {
      setResolvedOrderId(tx.orderId);
      return;
    }

    let isCancelled = false;
    const resolveId = async () => {
      try {
        const { getPublicClient, parseOrderIdFromReceipt } = await import("@/lib/p2pkit");
        const client = getPublicClient();
        const receipt = await client.getTransactionReceipt({ hash: tx.hash as `0x${string}` });
        if (receipt) {
          const parsed = await parseOrderIdFromReceipt(receipt, tx.recipient);
          if (parsed && !isCancelled) {
            const parsedStr = parsed.toString();
            setResolvedOrderId(parsedStr);
            setTx((prev) => (prev ? { ...prev, orderId: parsedStr } : prev));
            const { saveTransaction } = await import("@/lib/history");
            saveTransaction({ ...tx, orderId: parsedStr });
          }
        }
      } catch (err) {
        console.warn("Could not resolve on-chain orderId:", err);
      }
    };

    resolveId();
    return () => { isCancelled = true; };
  }, [tx?.hash]);

  const shortHash = tx ? `${tx.hash.slice(0, 8)}...${tx.hash.slice(-6)}` : "";
  const displayOrderId = resolvedOrderId || (tx?.orderId && isNumericOrderId(tx.orderId) ? tx.orderId : null);

  const isCashout = tx?.type === "cashout";
  const merchantDisplayName = !isCashout && (
    (tx?.merchantName && tx.merchantName !== "Merchant" && tx.merchantName !== "Zero-Knowledge Proof Verified")
      ? tx.merchantName
      : (tx?.recipient && tx.recipient.includes("@") ? formatUpiName(tx.recipient) : (tx?.merchantName || null))
  );

  // Share Receipt Implementation
  const handleShare = async () => {
    if (!tx) return;
    const recipientText = merchantDisplayName ? `${merchantDisplayName} (${tx.recipient})` : tx.recipient;
    const orderText = displayOrderId ? `#${displayOrderId}` : "Verified";
    const shareText = `ZkPay Payment Receipt\nAmount: ₹${tx.amountINR.toFixed(2)} (${tx.amountUSDC.toFixed(2)} USDC)\nRecipient: ${recipientText}\nOrder ID: ${orderText}\nStatus: Settled via UPI Rails\nTx Hash: ${tx.hash}\nVerified on Base L2`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "ZkPay Transaction Receipt",
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch (e: any) {
        if (e.name === "AbortError") return;
      }
    }

    // Fallback to clipboard
    await copyToClipboard(shareText, "share");
    triggerToast("Receipt summary copied!");
  };

  // Download Receipt as PNG Image using Canvas
  const handleDownload = useCallback(() => {
    if (!tx) return;
    setDownloading(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 750;
      canvas.height = 1050;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 1. Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 1050);
      bgGrad.addColorStop(0, "#0e0e11");
      bgGrad.addColorStop(0.5, "#15151a");
      bgGrad.addColorStop(1, "#0a0a0c");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 750, 1050);

      // 2. Specular border
      ctx.strokeStyle = "rgba(192, 198, 222, 0.2)";
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 710, 1010);

      // 3. Logo & Brand
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px 'Hanken Grotesk', sans-serif";
      ctx.fillText("ZkPay", 50, 75);

      ctx.fillStyle = "#90909c";
      ctx.font = "600 13px 'JetBrains Mono', monospace";
      ctx.fillText("OFFICIAL TRANSACTION RECEIPT", 50, 100);

      // 4. Status Beacon & Halo
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
      ctx.beginPath();
      ctx.arc(375, 200, 55, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(375, 200, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✓", 375, 212);

      // 5. Amount
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 14px 'JetBrains Mono', monospace";
      ctx.fillText("PAYMENT SETTLED", 375, 280);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 56px 'Hanken Grotesk', sans-serif";
      ctx.fillText(`₹${tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 375, 345);

      ctx.fillStyle = "#90909c";
      ctx.font = "500 18px 'JetBrains Mono', monospace";
      ctx.fillText(`≈ ${tx.amountUSDC.toFixed(2)} USDC`, 375, 380);

      if (merchantDisplayName) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.roundRect(175, 405, 400, 36, 18);
        ctx.fill();
        ctx.fillStyle = "#dce2fb";
        ctx.font = "600 15px 'Hanken Grotesk', sans-serif";
        ctx.fillText(`Paid to ${merchantDisplayName}`, 375, 428);
      }

      // 6. Horizontal Divider
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 470);
      ctx.lineTo(690, 470);
      ctx.stroke();

      // 7. Details Table
      ctx.textAlign = "left";
      const rows = [
        ["RECIPIENT UPI", tx.recipient],
        ["ORDER ID", displayOrderId ? `#${displayOrderId}` : "Verified"],
        ["NETWORK", "Base L2 (Gasless)"],
        ["TRANSACTION HASH", `${tx.hash.slice(0, 18)}...${tx.hash.slice(-10)}`],
        ["PLATFORM FEE (1%)", `$${tx.fee.toFixed(2)} USDC`],
        ["PROTOCOL FEE", tx.protocolFee && tx.protocolFee > 0 ? `$${tx.protocolFee.toFixed(2)} USDC` : "Free"],
        ["TOTAL CRYPTO DEBITED", `$${(tx.amountUSDC + (tx.protocolFee || 0)).toFixed(2)} USDC`],
        ["TIMESTAMP", new Date(tx.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })],
      ];

      let yPos = 520;
      rows.forEach(([label, val]) => {
        ctx.fillStyle = "#90909c";
        ctx.font = "bold 13px 'JetBrains Mono', monospace";
        ctx.fillText(label, 60, yPos);

        ctx.fillStyle = "#ffffff";
        ctx.font = "600 15px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(val, 690, yPos);
        ctx.textAlign = "left";

        yPos += 45;
      });

      // 8. Bottom Security Watermark
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(144, 144, 156, 0.6)";
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillText("🔒 Non-Custodial P2P Escrow • Encrypted Settlement Rails", 375, 960);
      ctx.fillText("https://zkpay.online", 375, 985);

      // 9. Download trigger
      const link = document.createElement("a");
      link.download = displayOrderId ? `zkpay-receipt-${displayOrderId}.png` : `zkpay-receipt-${tx.hash.slice(2, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      triggerToast("Receipt downloaded!");
    } catch (err) {
      console.error("Failed to generate receipt image:", err);
      triggerToast("Failed to download receipt");
    } finally {
      setDownloading(false);
    }
  }, [tx, displayOrderId]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0e0e0f]">
        <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
      </main>
    );
  }

  if (!tx) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0e0e0f] px-6 gap-4">
        <p className="text-[#909097] text-sm">Transaction record not found.</p>
        <button onClick={() => router.push("/")} className="btn-primary px-8 py-3 rounded-xl bg-white text-black font-semibold">
          Return to Home
        </button>
      </main>
    );
  }

  return (
    <div className="bg-[#0e0e0f] text-[#e5e2e3] font-body min-h-[100dvh] relative overflow-x-hidden selection:bg-emerald-500/20">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-mono text-white shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* WebGL Ambient Background Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0 opacity-60">
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>

      <div className="w-full max-w-md mx-auto min-h-[100dvh] relative flex flex-col justify-between px-5 pt-4 pb-8 z-10">
        
        {/* Header */}
        <header className="w-full flex items-center justify-between py-2">
          <button 
            onClick={() => router.push("/")} 
            className="flex items-center gap-2 text-[#909097] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono text-xs tracking-wider uppercase font-bold text-[#c0c6de]">ZkPay</span>
          </button>

          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-[#909097] tracking-wider uppercase">
            Receipt
          </span>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col items-center justify-center my-auto py-4">
          
          {/* Hero Section: Seamless Ambient Halo & 3D Glass Emblem (No Square Box) */}
          <section className="w-full flex flex-col items-center text-center relative">
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Radial Halo Glow diffusing seamlessly into background */}
              <div 
                className="absolute inset-0 rounded-full scale-125 animate-pulse pointer-events-none"
                style={{
                  background: "radial-gradient(circle at center, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0.06) 45%, transparent 70%)"
                }}
              />
              
              {/* Floating Beveled Emblem */}
              <div className="relative w-20 h-20 rounded-full border border-emerald-400/40 bg-gradient-to-b from-[#121c17] to-[#0a100d] shadow-[0_0_40px_rgba(16,185,129,0.35)] flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
            </div>

            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 font-semibold mt-1">
              {isCashout ? "Cash Out Settled" : "Payment Settled"}
            </span>
            
            <h1 className="font-headline text-[44px] sm:text-[50px] font-extrabold tracking-tight text-white mt-1 leading-none">
              ₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
            
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-[13px] text-[#909097] font-medium">≈ {tx.amountUSDC.toFixed(2)} USDC</span>
            </div>

            {/* Merchant Name or Zero-Knowledge Status Badge */}
            <div className="mt-3">
              {merchantDisplayName ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/15 text-white text-xs font-medium backdrop-blur-md shadow-sm">
                  <Store className="w-3.5 h-3.5 text-[#c0c6de]" />
                  <span>Paid to <strong className="text-white font-semibold">{merchantDisplayName}</strong></span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isCashout ? "Direct UPI Cashout" : "Zero-Knowledge Proof Verified"}</span>
                </div>
              )}
            </div>
          </section>

          {/* Floating Obsidian Glass Receipt Card */}
          <section className="w-full mt-6 rounded-2xl p-5 border border-white/10 relative overflow-hidden backdrop-blur-[40px] bg-gradient-to-b from-[#1a1a1e]/80 to-[#121215]/80 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            {/* Top Specular Rim */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
            
            {/* Recipient VPA & Live Status */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex flex-col text-left max-w-[65%]">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#909097]">
                  {isCashout ? "Settlement UPI" : "Merchant UPI VPA"}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-semibold text-white text-[15px] truncate font-mono" title={tx.recipient}>
                    {tx.recipient}
                  </span>
                  <button 
                    onClick={() => copyToClipboard(tx.recipient, "vpa")}
                    title="Copy UPI ID" 
                    className="text-[#909097] hover:text-white transition-colors active:scale-90 shrink-0"
                  >
                    {copiedKey === "vpa" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              
              <div className="flex flex-col items-end text-right">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#909097]">Status</span>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="font-mono text-[11px] font-medium text-emerald-400">UPI Rail Settled</span>
                </div>
              </div>
            </div>

            {/* Details Rows */}
            <div className="space-y-3 pt-4">
              
              {/* Row 1: Order ID (Replaces Order Type as requested) */}
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[#909097]">Order ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-white">
                    {displayOrderId ? `#${displayOrderId}` : "Resolving..."}
                  </span>
                  {displayOrderId && (
                    <button 
                      onClick={() => copyToClipboard(displayOrderId, "orderId")}
                      className="text-[#909097] hover:text-white transition-colors"
                      title="Copy Order ID"
                    >
                      {copiedKey === "orderId" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Network */}
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[#909097]">Network</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white font-mono text-xs">Base L2</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[#c0c6de]">
                    Gasless
                  </span>
                </div>
              </div>

              {/* Row 3: Transaction Hash */}
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[#909097]">Transaction Hash</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => copyToClipboard(tx.hash, "hash")}
                    className="text-[#909097] hover:text-white transition-colors"
                    title="Copy full hash"
                  >
                    {copiedKey === "hash" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <a 
                    href={`https://basescan.org/tx/${tx.hash}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="font-mono text-xs text-[#c0c6de] hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <DecryptedText text={shortHash} speed={30} />
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Row 4: Fee Breakdown */}
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-[#909097]">Fees Breakdown</span>
                <span className="font-mono text-xs text-[#e5e2e3]">
                  ${tx.fee.toFixed(2)} Platform • {tx.protocolFee && tx.protocolFee > 0 ? `$${tx.protocolFee.toFixed(2)} Protocol` : "Free Protocol"}
                </span>
              </div>

              {/* Row 5: Total USDC Debited */}
              <div className="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-white/[0.06]">
                <span className="text-[#c0c6de] font-medium">Total USDC Debited</span>
                <span className="font-mono font-bold text-white text-sm">
                  ${(tx.amountUSDC + (tx.protocolFee || 0)).toFixed(2)} USDC
                </span>
              </div>

              {/* Row 6: Timestamp */}
              <div className="flex items-center justify-between text-[11px] font-mono text-[#909097] pt-1">
                <span>Timestamp</span>
                <span>{new Date(tx.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
            </div>
          </section>

          {/* Security Guarantee */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-center text-[#909097]/70 text-[11px] font-mono">
            <Lock className="w-3 h-3" />
            <span>Funds settled via non-custodial P2P escrow</span>
          </div>

        </main>

        {/* Action Buttons */}
        <footer className="w-full flex flex-col gap-2.5 pt-4">
          
          {/* Primary Done Button */}
          <button 
            onClick={() => router.push("/")}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#e5e2e6] to-[#d8d4dc] hover:from-white hover:to-white text-[#0e0e0f] font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-[0_4px_20px_rgba(229,226,230,0.25)] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Done</span>
          </button>

          {/* Secondary Action Grid (Share & Download) */}
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <button 
              onClick={handleShare}
              className="py-3 px-4 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-white/90 text-xs font-semibold font-mono tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4 text-[#c0c6de]" />
              <span>Share Receipt</span>
            </button>

            <button 
              onClick={handleDownload}
              disabled={downloading}
              className="py-3 px-4 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-white/90 text-xs font-semibold font-mono tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-[#c0c6de]" />
              <span>{downloading ? "Saving..." : "Download PNG"}</span>
            </button>
          </div>

        </footer>

      </div>
    </div>
  );
}
