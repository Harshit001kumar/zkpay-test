import { http, fallback, createPublicClient, Transport, Chain } from "viem";
import { base, arbitrum, polygon, bsc } from "viem/chains";
import { normalizeChain } from "@/lib/constants";

/**
 * Enterprise RPC Resilience Manager for ZkPay.
 * 
 * Supports:
 * - Infura (Base, Polygon, Arbitrum, BSC, Ethereum) via INFURA_API_KEY
 * - NOWNodes (Solana, Base, Polygon, Arbitrum, BSC, Ethereum) via NOWNODES_API_KEY
 * - Alchemy / Helius via ALCHEMY_API_KEY / HELIUS_API_KEY
 * - Custom per-chain RPCs (SOLANA_RPC_URL, POLYGON_RPC_URL, etc.)
 * - Multi-RPC fallback cascade across premium & public endpoints
 */

function cleanEnvString(val?: string): string | undefined {
  if (!val) return undefined;
  let s = val.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith("`") && s.endsWith("`"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.length > 0 ? s : undefined;
}

export function getInfuraApiKey(): string | undefined {
  return (
    cleanEnvString(process.env.INFURA_API_KEY) ||
    cleanEnvString(process.env.INFURA_PROJECT_ID) ||
    cleanEnvString(process.env.INFURA_KEY) ||
    cleanEnvString(process.env.NEXT_PUBLIC_INFURA_API_KEY) ||
    cleanEnvString(process.env.NEXT_PUBLIC_INFURA_KEY)
  );
}

export function getNowNodesApiKey(): string | undefined {
  return (
    cleanEnvString(process.env.NOWNODES_API_KEY) ||
    cleanEnvString(process.env.NOWNODES_KEY) ||
    cleanEnvString(process.env.NOW_NODES_KEY) ||
    cleanEnvString(process.env.NOW_NODES_API_KEY) ||
    cleanEnvString(process.env.NEXT_PUBLIC_NOWNODES_API_KEY)
  );
}

export function getAlchemyApiKey(): string | undefined {
  return (
    cleanEnvString(process.env.ALCHEMY_API_KEY) ||
    cleanEnvString(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY)
  );
}

export function getHeliusApiKey(): string | undefined {
  return (
    cleanEnvString(process.env.HELIUS_API_KEY) ||
    cleanEnvString(process.env.NEXT_PUBLIC_HELIUS_API_KEY)
  );
}

// ─────────────────────────────────────────────────────────────
// 1. SOLANA RPC CONFIGURATION & RESILIENT JSON-RPC CLIENT
// ─────────────────────────────────────────────────────────────

export interface SolanaEndpoint {
  url: string;
  headers?: Record<string, string>;
  name: string;
}

export function getSolanaRpcEndpoints(): SolanaEndpoint[] {
  const endpoints: SolanaEndpoint[] = [];

  // 1. Custom Solana RPC from environment
  const custom =
    cleanEnvString(process.env.SOLANA_RPC_URL) ||
    cleanEnvString(process.env.SOL_RPC_URL) ||
    cleanEnvString(process.env.SOLANA_RPC);
  if (custom) {
    endpoints.push({ url: custom, name: "Custom Solana RPC" });
  }

  // 2. NOWNodes Solana
  const nowNodesKey = getNowNodesApiKey();
  if (nowNodesKey) {
    endpoints.push({
      url: "https://sol.nownodes.io",
      headers: {
        "api-key": nowNodesKey,
      },
      name: "NowNodes (Solana)",
    });
    endpoints.push({
      url: `https://sol.nownodes.io/${nowNodesKey}`,
      name: "NowNodes Path (Solana)",
    });
  }

  // 3. Helius (Solana Dedicated)
  const heliusKey = getHeliusApiKey();
  if (heliusKey) {
    endpoints.push({
      url: `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`,
      name: "Helius (Solana)",
    });
  }

  // 4. Alchemy (Solana)
  const alchemyKey = getAlchemyApiKey();
  if (alchemyKey) {
    endpoints.push({
      url: `https://solana-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      name: "Alchemy (Solana)",
    });
  }

  // 5. High-Availability Public Failovers
  const publicList = [
    { url: "https://solana-rpc.publicnode.com", name: "PublicNode (Solana)" },
    { url: "https://solana.drpc.org", name: "dRPC (Solana)" },
    { url: "https://rpc.ankr.com/solana", name: "Ankr (Solana)" },
    { url: "https://solana.public-rpc.com", name: "PublicRPC (Solana)" },
    { url: "https://api.mainnet-beta.solana.com", name: "Solana Official" },
    { url: "https://solana-mainnet.rpc.extrnode.com", name: "Extrnode (Solana)" },
  ];

  for (const p of publicList) {
    endpoints.push(p);
  }

  return endpoints;
}

/**
 * Resilient Solana JSON-RPC dispatcher with automatic multi-node failover.
 * Tries NOWNodes, Infura/Alchemy/Helius, and top public nodes sequentially.
 */
export async function fetchResilientSolanaRpc(method: string, params: any[]): Promise<any> {
  const endpoints = getSolanaRpcEndpoints();
  let lastError: any = null;
  const attempts: string[] = [];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(ep.headers || {}),
      };

      const res = await fetch(ep.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `sol-${Date.now()}`,
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        attempts.push(`${ep.name}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      if (data.error) {
        lastError = data.error;
        attempts.push(`${ep.name}: ${data.error.message || "RPC error"}`);
        continue;
      }

      // Success
      return data.result;
    } catch (err: any) {
      lastError = err;
      attempts.push(`${ep.name}: ${err?.name === "AbortError" ? "Timeout (6.5s)" : err?.message || "Failed"}`);
    }
  }

  throw new Error(
    `All Solana RPCs failed for '${method}' (${endpoints.length} endpoints attempted: ${attempts.join(", ")}). Last error: ${
      lastError?.message || JSON.stringify(lastError)
    }`
  );
}

// ─────────────────────────────────────────────────────────────
// 2. EVM MULTI-CHAIN RPC CONFIGURATION & TRANSPORTS
// ─────────────────────────────────────────────────────────────

export interface EvmRpcConfig {
  chain: Chain;
  key: string;
  transports: Transport[];
  urls: string[];
}

export function getEvmRpcConfig(chainStr: string): EvmRpcConfig {
  const c = normalizeChain(chainStr) || chainStr.toLowerCase();
  const infuraKey = getInfuraApiKey();
  const nowNodesKey = getNowNodesApiKey();
  const alchemyKey = getAlchemyApiKey();

  let targetChain: Chain = base;
  let key = "base";
  const customUrls: string[] = [];
  const premiumUrls: { url: string; headers?: Record<string, string> }[] = [];
  const publicUrls: string[] = [];

  switch (c) {
    case "polygon":
    case "matic":
    case "pol": {
      // Override default viem chain rpcUrls so internal fallbacks never contact deprecated polygon-rpc.com
      targetChain = {
        ...polygon,
        rpcUrls: {
          ...polygon.rpcUrls,
          default: {
            http: [
              "https://polygon-bor-rpc.publicnode.com",
              "https://polygon.drpc.org",
              "https://1rpc.io/matic",
              "https://gateway.tenderly.co/public/polygon",
              "https://polygon.llamarpc.com",
            ],
          },
          public: {
            http: [
              "https://polygon-bor-rpc.publicnode.com",
              "https://polygon.drpc.org",
              "https://1rpc.io/matic",
              "https://gateway.tenderly.co/public/polygon",
              "https://polygon.llamarpc.com",
            ],
          },
        },
      };
      key = "polygon";

      const custom =
        cleanEnvString(process.env.POLYGON_RPC_URL) ||
        cleanEnvString(process.env.POL_RPC_URL) ||
        cleanEnvString(process.env.MATIC_RPC_URL);
      if (custom) customUrls.push(custom);

      if (infuraKey) {
        premiumUrls.push({ url: `https://polygon-mainnet.infura.io/v3/${infuraKey}` });
      }
      if (nowNodesKey) {
        premiumUrls.push({
          url: "https://polygon.nownodes.io",
          headers: { "api-key": nowNodesKey },
        });
      }
      if (alchemyKey) {
        premiumUrls.push({ url: `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}` });
      }

      publicUrls.push(
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon.drpc.org",
        "https://1rpc.io/matic",
        "https://gateway.tenderly.co/public/polygon",
        "https://polygon.llamarpc.com"
      );
      break;
    }

    case "arb":
    case "arbitrum": {
      targetChain = arbitrum;
      key = "arb";

      const custom =
        cleanEnvString(process.env.ARBITRUM_RPC_URL) ||
        cleanEnvString(process.env.ARB_RPC_URL);
      if (custom) customUrls.push(custom);

      if (infuraKey) {
        premiumUrls.push({ url: `https://arbitrum-mainnet.infura.io/v3/${infuraKey}` });
      }
      if (nowNodesKey) {
        premiumUrls.push({
          url: "https://arbitrum.nownodes.io",
          headers: { "api-key": nowNodesKey },
        });
      }
      if (alchemyKey) {
        premiumUrls.push({ url: `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}` });
      }

      publicUrls.push(
        "https://arb1.arbitrum.io/rpc",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arbitrum.llamarpc.com",
        "https://1rpc.io/arb",
        "https://arbitrum.drpc.org"
      );
      break;
    }

    case "bsc":
    case "bnb": {
      targetChain = bsc;
      key = "bsc";

      const custom =
        cleanEnvString(process.env.BSC_RPC_URL) ||
        cleanEnvString(process.env.BNB_RPC_URL);
      if (custom) customUrls.push(custom);

      if (infuraKey) {
        premiumUrls.push({ url: `https://bsc-mainnet.infura.io/v3/${infuraKey}` });
      }
      if (nowNodesKey) {
        premiumUrls.push({
          url: "https://bsc.nownodes.io",
          headers: { "api-key": nowNodesKey },
        });
      }

      publicUrls.push(
        "https://bsc-dataseed.binance.org",
        "https://bsc-rpc.publicnode.com",
        "https://binance.llamarpc.com",
        "https://1rpc.io/bnb",
        "https://bsc.drpc.org"
      );
      break;
    }

    case "base":
    default: {
      targetChain = base;
      key = "base";

      const custom =
        cleanEnvString(process.env.BASE_RPC_URL) ||
        cleanEnvString(process.env.NEXT_PUBLIC_RPC_URL);
      if (custom) customUrls.push(custom);

      if (infuraKey) {
        premiumUrls.push({ url: `https://base-mainnet.infura.io/v3/${infuraKey}` });
      }
      if (nowNodesKey) {
        premiumUrls.push({
          url: "https://base.nownodes.io",
          headers: { "api-key": nowNodesKey },
        });
      }
      if (alchemyKey) {
        premiumUrls.push({ url: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}` });
      }

      publicUrls.push(
        "https://mainnet.base.org",
        "https://base-rpc.publicnode.com",
        "https://base.llamarpc.com",
        "https://1rpc.io/base",
        "https://base.drpc.org"
      );
      break;
    }
  }

  // Build transports in priority order: Custom -> Premium (Infura/NowNodes) -> Public Fallbacks
  const transports: Transport[] = [];
  const urls: string[] = [];

  for (const u of customUrls) {
    urls.push(u);
    transports.push(http(u, { timeout: 8000, retryCount: 2 }));
  }

  for (const p of premiumUrls) {
    urls.push(p.url);
    transports.push(
      http(p.url, {
        fetchOptions: p.headers ? { headers: p.headers } : undefined,
        timeout: 8000,
        retryCount: 3,
      })
    );
  }

  for (const u of publicUrls) {
    urls.push(u);
    transports.push(http(u, { timeout: 7000, retryCount: 2 }));
  }

  return {
    chain: targetChain,
    key,
    transports,
    urls,
  };
}

/**
 * Returns a resilient viem PublicClient with Infura, NowNodes, and public fallbacks.
 */
export function getResilientPublicClientForChain(chainStr: string) {
  const { chain, transports } = getEvmRpcConfig(chainStr);
  return createPublicClient({
    chain,
    transport: fallback(transports, { rank: false }),
  });
}
