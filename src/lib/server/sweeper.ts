import {
  parseAbi,
  hexToSignature,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import crypto from "crypto";
import { CHAIN, CONTRACTS } from "@/lib/constants";
import { getResilientPublicClient } from "@/lib/server/p2pRates";
import {
  getRelayerAddress,
  getRelayerBalance,
  getRelayerWalletClient,
} from "@/lib/server/relayer";
import { PayInSession, updatePayInSession } from "@/lib/server/payStore";

const USDC_ADDRESS = getAddress(CONTRACTS.USDC);
const TREASURY_ADDRESS = getAddress(
  (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || CONTRACTS.TREASURY) as `0x${string}`
);

// Minimal ABI required for EIP-3009 transferWithAuthorization on Circle USDC (Base Mainnet)
const USDC_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

export interface SweepResult {
  success: boolean;
  method: "eip-3009-relay";
  sessionId: string;
  payinAddress: string;
  amountUsdc: string;
  destination: string;
  txHash?: string;
  error?: string;
}

/**
 * Sweeps USDC from an ephemeral payin deposit address to the ZkPay Treasury
 * strictly using EIP-3009 (transferWithAuthorization).
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * PURE RELAY METHOD (ZERO ETH SPENT / SENT TO DEPOSIT ADDRESS):
 * 1. The ephemeral deposit account signs an EIP-712 TransferWithAuthorization
 *    typed message completely OFF-CHAIN using its private key (Zero Gas, 0 ETH).
 * 2. The backend Sweeper / Relayer wallet broadcasts `transferWithAuthorization`
 *    directly to the USDC contract on Base Mainnet.
 * 3. The Sweeper wallet pays the sub-cent Base L2 gas fee.
 * 4. The deposit address NEVER receives or requires any ETH.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function sweepPayInSession(
  session: PayInSession,
  destination: `0x${string}` = TREASURY_ADDRESS
): Promise<SweepResult> {
  const publicClient = getResilientPublicClient();
  const payinAddress = getAddress(session.payinAddress as `0x${string}`);
  const destinationAddress = getAddress(destination);

  try {
    // 1. Verify current USDC balance on Base Mainnet
    const balanceWei = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [payinAddress],
    })) as bigint;

    if (balanceWei <= 0n) {
      return {
        success: false,
        method: "eip-3009-relay",
        sessionId: session.id,
        payinAddress,
        amountUsdc: "0.00",
        destination: destinationAddress,
        error: "No USDC balance available to sweep on Base.",
      };
    }

    const amountUsdc = (Number(balanceWei) / 1e6).toFixed(2);

    // 2. Parse and validate ephemeral private key
    let rawKey = session.payinPrivateKey.trim();
    if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
      rawKey = rawKey.slice(1, -1);
    }
    if (!rawKey.startsWith("0x")) {
      rawKey = `0x${rawKey}`;
    }
    const depositAccount = privateKeyToAccount(rawKey as `0x${string}`);

    // Verify derived account matches payinAddress (critical safety check)
    if (getAddress(depositAccount.address) !== payinAddress) {
      throw new Error(
        `Pay-in private key derives ${depositAccount.address}, which does not match deposit address ${payinAddress}`
      );
    }

    // 3. Check Sweeper / Relayer wallet has enough ETH for Base transaction fee
    const relayerAddress = getRelayerAddress();
    const relayerBalance = await publicClient.getBalance({ address: relayerAddress });
    if (relayerBalance <= 0n) {
      throw new Error(
        `Sweeper wallet (${relayerAddress}) has 0 ETH balance. Please fund it with micro-ETH to sponsor Base gas.`
      );
    }

    console.log(
      `[Sweeper] Executing EIP-3009 gasless relay sweep: ${amountUsdc} USDC from ${payinAddress} -> ${destinationAddress} (Relayer: ${relayerAddress})...`
    );

    // 4. Generate unique 32-byte cryptographically-secure random nonce
    const nonce = (`0x${crypto.randomBytes(32).toString("hex")}`) as `0x${string}`;
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 7200); // 2 hours validity window

    // 5. Off-chain EIP-712 typed signature (0 gas, 0 ETH needed at payinAddress)
    const signatureHex = await depositAccount.signTypedData({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: BigInt(CHAIN.id),
        verifyingContract: USDC_ADDRESS,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: payinAddress,
        to: destinationAddress,
        value: balanceWei,
        validAfter,
        validBefore,
        nonce,
      },
    });

    // 6. Deconstruct signature into standard v, r, s
    const sig = hexToSignature(signatureHex);
    let v = sig.v !== undefined ? Number(sig.v) : (sig.yParity === 0 ? 27 : 28);
    if (v < 27) {
      v += 27;
    }

    // 7. Relayer broadcasts transferWithAuthorization to Base Mainnet
    const relayerWallet = getRelayerWalletClient();
    const txHash = await relayerWallet.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "transferWithAuthorization",
      args: [
        payinAddress,
        destinationAddress,
        balanceWei,
        validAfter,
        validBefore,
        nonce,
        v,
        sig.r,
        sig.s,
      ],
    });

    // 8. Await transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status === "reverted") {
      throw new Error(`Sweep transaction reverted on-chain (tx: ${txHash})`);
    }

    console.log(
      `[Sweeper] EIP-3009 Relay SUCCESS! Swept ${amountUsdc} USDC from ${payinAddress} -> ${destinationAddress}. TX: ${txHash}`
    );

    // Update in-memory session with on-chain transaction hash
    updatePayInSession(session.id, { txHash });

    return {
      success: true,
      method: "eip-3009-relay",
      sessionId: session.id,
      payinAddress,
      amountUsdc,
      destination: destinationAddress,
      txHash,
    };
  } catch (err: any) {
    console.error(`[Sweeper] EIP-3009 Relay sweep failed for session ${session.id}:`, err);
    return {
      success: false,
      method: "eip-3009-relay",
      sessionId: session.id,
      payinAddress,
      amountUsdc: "0.00",
      destination: destinationAddress,
      error: err.message || "Failed to sweep deposit balance via EIP-3009 relay.",
    };
  }
}

/**
 * Returns current status and balance of the backend Sweeper / Relayer wallet.
 */
export async function getSweeperStatus() {
  try {
    const address = getRelayerAddress();
    const balance = await getRelayerBalance();
    return {
      configured: true,
      address,
      balanceEth: (Number(balance) / 1e18).toFixed(4),
      healthy: balance > 30000000000000n, // ~0.00003 ETH
    };
  } catch (err: any) {
    return {
      configured: false,
      address: null,
      balanceEth: "0.0000",
      healthy: false,
      error: err.message,
    };
  }
}
