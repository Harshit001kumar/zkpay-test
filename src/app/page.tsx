"use client";

import { usePrivy } from "@privy-io/react-auth";
import LandingPage from "@/components/LandingPage";
import dynamic from "next/dynamic";

const AppShell = dynamic(() => import("@/components/AppShell"), { ssr: false });

export default function Home() {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#131315]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-[#909097]">Loading...</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  return <AppShell />;
}
