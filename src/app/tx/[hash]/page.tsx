"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { getTransactionByHash, TransactionRecord } from "@/lib/history";
import { ArrowRight, ExternalLink } from "lucide-react";

export default function TransactionReceipt() {
  const params = useParams();
  const router = useRouter();
  const [tx, setTx] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hash = params.hash as string;
    if (hash) {
      const record = getTransactionByHash(hash);
      setTx(record);
    }
    setLoading(false);
  }, [params.hash]);

  // Shader effect
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
    window.addEventListener('resize', syncSize);
    syncSize();

    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
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
        
        vec3 sapphire = vec3(0.05, 0.2, 0.5);
        vec3 emerald = vec3(0.05, 0.4, 0.3);
        vec3 baseColor = mix(sapphire, emerald, 0.5);
        
        float pulse = sin(u_time * 1.5) * 0.1 + 0.9;
        float core = smoothstep(0.45 * pulse, 0.0, dist);
        
        float ring = smoothstep(0.5 * pulse, 0.48 * pulse, dist) * smoothstep(0.45 * pulse, 0.47 * pulse, dist);
        
        float n = fract(sin(dot(uv * u_time, vec2(12.9898, 78.233))) * 43758.5453);
        float particles = smoothstep(0.995, 1.0, n) * core;
        
        vec3 finalColor = baseColor * (core * 0.2 + ring + particles);
        
        gl_FragColor = vec4(finalColor, finalColor.r * 1.5);
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');

    const render = (t: number) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };
    render(0);

    return () => {
      window.removeEventListener('resize', syncSize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

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
        <p className="text-[#909097] text-sm">Transaction not found.</p>
        <button onClick={() => router.push("/")} className="btn-primary px-8">
          Go Home
        </button>
      </main>
    );
  }

  const isPayment = tx.type === "payment";
  const isCashout = tx.type === "cashout";
  const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`;

  return (
    <div className="bg-[#0e0e0f] text-[#e5e2e3] font-body-md min-h-[100dvh] relative overflow-x-hidden selection:bg-[#c0c6de]/30">
      <style dangerouslySetInnerHTML={{__html: `
        .glass-pane {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(226, 232, 240, 0.1);
        }
        .silver-rim {
            box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.25), 
                        0 0 15px rgba(255, 255, 255, 0.05);
        }
        .chrome-3d {
            background: linear-gradient(135deg, #f8fafc 0%, #94a3b8 45%, #cbd5e1 50%, #64748b 55%, #e2e8f0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            filter: drop-shadow(0 0 30px rgba(52, 211, 153, 0.4)) drop-shadow(0 0 60px rgba(59, 130, 246, 0.2));
        }
        .check-glow {
            filter: drop-shadow(0 0 20px rgba(16, 185, 129, 0.6)) drop-shadow(0 0 40px rgba(37, 99, 235, 0.3));
        }
      `}} />

      {/* Success Shader Background Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }}></canvas>
      </div>

      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-8 py-6 mix-blend-difference">
        <div className="font-label-caps text-[12px] tracking-[0.15em] font-bold text-[#c0c6de]">ZKPAY</div>
        <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden">
          <span className="material-symbols-outlined text-[20px] text-[#c0c6de]">account_circle</span>
        </div>
      </header>

      <main className="relative min-h-[100dvh] flex flex-col items-center justify-between pt-32 pb-40 px-6 z-10">
        
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
          {/* 3D Chrome Checkmark */}
          <div className="mb-8 relative w-48 h-48 flex items-center justify-center">
            {/* Inner glow ring */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 blur-2xl animate-pulse"></div>
            {/* Large Checkmark Symbol */}
            <span className="material-symbols-outlined text-[140px] chrome-3d font-bold check-glow">
              check_circle
            </span>
          </div>
          
          <h1 className="font-headline-lg text-[48px] md:text-[64px] leading-tight tracking-tighter text-white">
            {isPayment ? "Payment Successful" : isCashout ? "Cash Out Successful" : "Transaction Complete"}
          </h1>
        </div>

        {/* Receipt Section: Floating Bottom Card */}
        <div className="w-full max-w-[480px] animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 mt-12 mb-auto">
          <div className="glass-pane silver-rim rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col gap-y-8">
              
              {/* Amount Block */}
              <div className="flex flex-col text-center sm:text-left">
                <span className="font-label-caps text-[10px] font-bold tracking-widest text-[#909097] mb-1">AMOUNT SENT</span>
                <div className="flex flex-wrap items-baseline justify-center sm:justify-start gap-x-2">
                  <span className="text-[42px] font-extrabold text-white tracking-tighter">
                    ₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="text-sm font-medium text-[#c6c6cd] mt-1">{tx.amountUSDC.toFixed(2)} USDC</span>
              </div>
              
              {/* Split Details */}
              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
                <div>
                  <span className="font-label-caps text-[10px] font-bold tracking-widest text-[#909097] mb-1 block">RECIPIENT</span>
                  <p className="font-semibold text-[#bcc7de] truncate" title={tx.recipient}>{tx.recipient}</p>
                </div>
                <div className="text-right">
                  <span className="font-label-caps text-[10px] font-bold tracking-widest text-[#909097] mb-1 block">NETWORK</span>
                  <p className="font-semibold text-[#bcc7de]">{tx.network}</p>
                </div>
              </div>
              
              {/* Actionable Meta */}
              <a 
                href={`https://basescan.org/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-white/[0.03] rounded-xl px-4 py-4 border border-white/5 hover:bg-white/[0.08] transition-colors cursor-pointer group active:scale-95"
              >
                <div className="flex flex-col">
                  <span className="font-label-caps text-[9px] font-bold text-[#909097] uppercase tracking-tighter mb-1">Transaction Hash</span>
                  <span className="text-[12px] font-mono text-[#c6c6cd] font-semibold tracking-tight">{shortHash}</span>
                </div>
                <ExternalLink className="w-5 h-5 text-[#c0c6de] group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </a>
              
            </div>
          </div>
        </div>

      </main>

      {/* Bottom Sticky Action */}
      <div className="fixed bottom-0 left-0 w-full p-8 z-50 flex justify-center pointer-events-none">
        <div className="w-full max-w-[480px] pointer-events-auto animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
          <button 
            onClick={() => router.push("/")}
            className="w-full py-5 glass-pane silver-rim text-white font-bold rounded-xl active:scale-[0.98] transition-all duration-200 shadow-xl flex items-center justify-center gap-x-2 backdrop-blur-md hover:bg-white/10 uppercase tracking-[0.1em] font-label-caps text-[12px]"
          >
            Return to Home
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

    </div>
  );
}
