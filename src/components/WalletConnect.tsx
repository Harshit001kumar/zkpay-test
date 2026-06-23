"use client";

interface WalletConnectProps {
  isConnected: boolean;
  walletAddress: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function WalletConnect({
  isConnected,
  walletAddress,
  onConnect,
  onDisconnect,
}: WalletConnectProps) {
  const truncate = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  if (isConnected) {
    return (
      <button
        onClick={onDisconnect}
        className="glass-card flex items-center gap-2 px-3 py-2 transition-all hover:border-white/20"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: "var(--gradient-primary)" }}
        >
          {walletAddress.slice(2, 4).toUpperCase()}
        </div>
        <span className="text-xs font-mono font-medium">
          {truncate(walletAddress)}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onConnect}
      className="glass-card flex items-center gap-2 px-4 py-2.5 transition-all hover:border-white/20"
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: "var(--color-ocean-blue)" }}
      />
      <span className="text-xs font-semibold">Connect</span>
    </button>
  );
}
