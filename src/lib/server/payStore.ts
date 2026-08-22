/**
 * ZkPay Pay Links & Pay-In Sessions — Server-side data store.
 * 
 * Uses a Map (in-process memory) for MVP. In production this can be
 * swapped for Redis / Postgres / KV without changing the API surface.
 */

export interface PayLink {
  id: string;
  title: string;
  amountINR: number;
  recipientUpi: string;
  type: "one_time" | "reusable";
  status: "ACTIVE" | "PAID" | "EXPIRED";
  webhookUrl?: string;
  redirectUrl?: string;
  estimatedUsdc: string;
  rate: number;
  createdAt: number;
  paidAt?: number;
  txHash?: string;
  p2pOrderId?: string;
}

export interface PayInSession {
  id: string;
  recipientUpi: string;
  amountINR: number;
  expectedUsdc: string;
  feeUsdc: string;
  rate: number;
  payinAddress: string;
  payinPrivateKey: string; // Server-only, never exposed
  status: "AWAITING_PAYMENT" | "DETECTED" | "PROCESSING" | "SETTLED" | "EXPIRED";
  webhookUrl?: string;
  createdAt: number;
  expiresAt: number;
  receivedUsdc?: string;
  txHash?: string;
  p2pOrderId?: string;
}

// In-memory stores — MVP, replace with persistent DB in production
const payLinks = new Map<string, PayLink>();
const payInSessions = new Map<string, PayInSession>();

// Generates a cryptographically-secure unique ID with prefix
function generateId(prefix: string): string {
  // crypto.randomUUID() is available in Node 19+ and all modern runtimes
  const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${uuid}`;
}

// ────────────────── Pay Links ──────────────────

export function createPayLink(data: Omit<PayLink, "id" | "status" | "createdAt">): PayLink {
  const link: PayLink = {
    ...data,
    id: generateId("pl"),
    status: "ACTIVE",
    createdAt: Date.now(),
  };
  payLinks.set(link.id, link);
  return link;
}

export function getPayLink(id: string): PayLink | undefined {
  return payLinks.get(id);
}

export function updatePayLink(id: string, updates: Partial<PayLink>): PayLink | undefined {
  const link = payLinks.get(id);
  if (!link) return undefined;
  const updated = { ...link, ...updates };
  payLinks.set(id, updated);
  return updated;
}

export function listPayLinks(): PayLink[] {
  return Array.from(payLinks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

// ────────────────── Pay-In Sessions ──────────────────

export function createPayInSession(data: Omit<PayInSession, "id" | "status" | "createdAt">): PayInSession {
  const session: PayInSession = {
    ...data,
    id: generateId("ses"),
    status: "AWAITING_PAYMENT",
    createdAt: Date.now(),
  };
  payInSessions.set(session.id, session);
  return session;
}

export function getPayInSession(id: string): PayInSession | undefined {
  return payInSessions.get(id);
}

export function updatePayInSession(id: string, updates: Partial<PayInSession>): PayInSession | undefined {
  const session = payInSessions.get(id);
  if (!session) return undefined;
  const updated = { ...session, ...updates };
  payInSessions.set(id, updated);
  return updated;
}

export function getActivePayInSessions(): PayInSession[] {
  return Array.from(payInSessions.values()).filter(
    (s) => s.status === "AWAITING_PAYMENT" && s.expiresAt > Date.now()
  );
}

export function expireOldSessions(): number {
  let expired = 0;
  const now = Date.now();
  for (const [id, session] of payInSessions.entries()) {
    if (session.status === "AWAITING_PAYMENT" && session.expiresAt <= now) {
      payInSessions.set(id, { ...session, status: "EXPIRED" });
      expired++;
    }
  }
  return expired;
}
