"use client";

import { usePrivy } from "@privy-io/react-auth";
import LandingPage from "@/components/LandingPage";
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/Dashboard"), { ssr: false });

export default function Home() {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  return <Dashboard />;
}
