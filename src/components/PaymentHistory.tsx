"use client";

interface PaymentHistoryProps {
  onClose: () => void;
}

const historyItems = [
  {
    id: "0x1a2b",
    merchant: "Starbucks India",
    amount: "-₹450.00",
    crypto: "5.40 USDC",
    status: "completed" as const,
    date: "Jun 23, 2026",
    time: "2:30 PM",
    icon: "☕",
    type: "buy",
  },
  {
    id: "0x3c4d",
    merchant: "Cash Out to Bank",
    amount: "+₹8,350.00",
    crypto: "100 USDC",
    status: "completed" as const,
    date: "Jun 23, 2026",
    time: "1:15 PM",
    icon: "🏦",
    type: "cashout",
  },
  {
    id: "0x5e6f",
    merchant: "Amazon.in",
    amount: "-₹2,199.00",
    crypto: "26.40 USDC",
    status: "pending" as const,
    date: "Jun 23, 2026",
    time: "11:00 AM",
    icon: "📦",
    type: "buy",
  },
  {
    id: "0x7g8h",
    merchant: "Zomato",
    amount: "-₹680.00",
    crypto: "8.16 USDC",
    status: "completed" as const,
    date: "Jun 22, 2026",
    time: "8:45 PM",
    icon: "🍕",
    type: "buy",
  },
  {
    id: "0x9i0j",
    merchant: "Flipkart",
    amount: "-₹3,499.00",
    crypto: "42.00 USDC",
    status: "completed" as const,
    date: "Jun 22, 2026",
    time: "3:20 PM",
    icon: "🛒",
    type: "buy",
  },
  {
    id: "0xk1l2",
    merchant: "Cash Out to UPI",
    amount: "+₹4,175.00",
    crypto: "50 USDC",
    status: "completed" as const,
    date: "Jun 21, 2026",
    time: "6:00 PM",
    icon: "🏦",
    type: "cashout",
  },
  {
    id: "0xm3n4",
    merchant: "Swiggy",
    amount: "-₹320.00",
    crypto: "3.84 USDC",
    status: "failed" as const,
    date: "Jun 21, 2026",
    time: "1:00 PM",
    icon: "🥡",
    type: "buy",
  },
];

export default function PaymentHistory({ onClose }: PaymentHistoryProps) {
  return (
    <div
      className="min-h-screen page-transition pb-8"
      style={{ background: "var(--color-surface)" }}
    >
      {/* Header */}
      <header className="px-5 pt-14 pb-4 flex items-center gap-4">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center"
        >
          ←
        </button>
        <div>
          <h2 className="text-xl font-bold">Payment History</h2>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Powered by P2PKit Subgraph
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="px-5 mb-4 flex gap-2 overflow-x-auto">
        {["All", "Payments", "Cash Outs", "Pending"].map((filter, i) => (
          <button
            key={filter}
            className="px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: i === 0 ? "var(--gradient-primary-subtle)" : "rgba(255,255,255,0.03)",
              border: i === 0 ? "1px solid rgba(0,119,190,0.3)" : "1px solid var(--glass-border)",
              color: i === 0 ? "var(--color-primary)" : "var(--color-on-surface-variant)",
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="px-5">
        <div className="glass-card-static overflow-hidden">
          {historyItems.map((tx, i) => (
            <div key={tx.id}>
              <div className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-white/[0.03] cursor-pointer">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: "var(--glass-bg)" }}
                  >
                    {tx.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{tx.merchant}</p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--color-on-surface-variant)" }}
                    >
                      {tx.crypto} · {tx.date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="font-semibold text-sm"
                    style={{
                      color:
                        tx.type === "cashout"
                          ? "#a3d9a5"
                          : "var(--color-on-surface)",
                    }}
                  >
                    {tx.amount}
                  </p>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium inline-block mt-1 ${
                      tx.status === "completed"
                        ? "status-completed"
                        : tx.status === "pending"
                        ? "status-pending"
                        : "status-failed"
                    }`}
                  >
                    {tx.status === "completed"
                      ? "Done"
                      : tx.status === "pending"
                      ? "Pending"
                      : "Failed"}
                  </span>
                </div>
              </div>
              {i < historyItems.length - 1 && <div className="divider mx-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Support link */}
      <div className="px-5 mt-6 text-center">
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Having issues with a payment?{" "}
          <button className="underline" style={{ color: "var(--color-primary)" }}>
            Open Support
          </button>
        </p>
      </div>
    </div>
  );
}
