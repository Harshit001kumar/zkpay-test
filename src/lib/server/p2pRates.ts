// Deprecated legacy fiat module — ZkPay is now exclusively a Cross-Chain Swap Provider.
import { getResilientPublicClientForChain } from "./rpcConfig";

export function getResilientPublicClient() {
  return getResilientPublicClientForChain("base");
}
