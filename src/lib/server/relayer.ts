import { createWalletClient, fallback } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getEvmRpcConfig, getResilientPublicClientForChain } from "@/lib/server/rpcConfig";

function getRelayerPrivateKey(): `0x${string}` {
  const raw =
    process.env.RELAYER_PRIVATE_KEY ||
    process.env.GAS_RELAYER_PRIVATE_KEY ||
    process.env.GAS_TANK_PRIVATE_KEY ||
    process.env.SWEEPER_PRIVATE_KEY;

  if (!raw) {
    console.warn("[Relayer] RELAYER_PRIVATE_KEY is not configured in environment.");
    throw new Error("Relayer private key is not configured.");
  }

  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  if (!key.startsWith("0x")) {
    key = `0x${key}`;
  }

  return key as `0x${string}`;
}

let _relayerAccount: any = null;
function getRelayerAccount() {
  if (!_relayerAccount) {
    _relayerAccount = privateKeyToAccount(getRelayerPrivateKey());
  }
  return _relayerAccount;
}

let _walletClient: any = null;
export function getRelayerWalletClient() {
  if (!_walletClient) {
    const { chain, transports } = getEvmRpcConfig("base");
    _walletClient = createWalletClient({
      account: getRelayerAccount(),
      chain,
      transport: fallback(transports, { rank: false }),
    });
  }
  return _walletClient;
}

// Same relayer key, bound to the requested EVM swap chain (Base, Polygon, Arbitrum, BSC, Ethereum)
const _chainWalletClients = new Map<string, any>();
export function getRelayerWalletClientForChain(chainStr: string) {
  const { chain, transports, key } = getEvmRpcConfig(chainStr);
  const cached = _chainWalletClients.get(key);
  if (cached) return cached;

  const client = createWalletClient({
    account: getRelayerAccount(),
    chain,
    transport: fallback(transports, { rank: false }),
  });
  _chainWalletClients.set(key, client);
  return client;
}

export function getRelayerAddress(): `0x${string}` {
  return getRelayerAccount().address;
}

export async function getRelayerBalance(): Promise<bigint> {
  const publicClient = getResilientPublicClientForChain("base");
  return publicClient.getBalance({ address: getRelayerAddress() });
}
