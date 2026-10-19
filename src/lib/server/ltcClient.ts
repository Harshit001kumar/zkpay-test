import crypto from "crypto";
import { Buffer } from "buffer";
import { getNowNodesApiKey } from "./rpcConfig";

export interface LtcUtxo {
  txid: string;
  vout: number;
  value: bigint; // in satoshis (1 LTC = 100_000_000 satoshis)
  scriptPubKey?: string;
}

export interface LtcBalanceResult {
  balanceSatoshis: bigint;
  utxos: LtcUtxo[];
}

// Standard Litecoin network definition for bitcoinjs-lib
export const LITECOIN_NETWORK = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: {
    public: 0x019da462,
    private: 0x019d9fee,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

/**
 * Queries LTC address balance and UTXOs using NowNodes with failovers to LitecoinSpace and BlockCypher.
 */
export async function getLtcBalanceAndUtxos(address: string): Promise<LtcBalanceResult> {
  const cleanAddr = address.trim();
  const nowNodesKey = getNowNodesApiKey();

  // 1. Try NOWNodes Blockbook API
  if (nowNodesKey) {
    try {
      const res = await fetch(`https://ltc.nownodes.io/api/v2/address/${cleanAddr}?details=basic`, {
        method: "GET",
        headers: { "api-key": nowNodesKey },
      });
      if (res.ok) {
        const data = await res.json();
        const balanceSatoshis = BigInt(data.balance || "0");
        
        // If balance > 0, fetch UTXOs from NOWNodes
        if (balanceSatoshis > 0n) {
          const utxoRes = await fetch(`https://ltc.nownodes.io/api/v2/utxo/${cleanAddr}`, {
            method: "GET",
            headers: { "api-key": nowNodesKey },
          });
          if (utxoRes.ok) {
            const rawUtxos = await utxoRes.json();
            const utxos: LtcUtxo[] = (Array.isArray(rawUtxos) ? rawUtxos : []).map((u: any) => ({
              txid: u.txid,
              vout: Number(u.vout),
              value: BigInt(u.value || "0"),
            }));
            return { balanceSatoshis, utxos };
          }
        }
        return { balanceSatoshis, utxos: [] };
      }
    } catch (e) {
      console.warn("[LTC] NowNodes query warning, falling back:", e);
    }
  }

  // 2. Fallback: LitecoinSpace (mempool.space fork for LTC)
  try {
    const utxoRes = await fetch(`https://litecoinspace.org/api/address/${cleanAddr}/utxo`, {
      method: "GET",
    });
    if (utxoRes.ok) {
      const rawUtxos = await utxoRes.json();
      let total = 0n;
      const utxos: LtcUtxo[] = [];
      if (Array.isArray(rawUtxos)) {
        for (const u of rawUtxos) {
          const val = BigInt(u.value || 0);
          total += val;
          utxos.push({
            txid: u.txid,
            vout: Number(u.vout),
            value: val,
          });
        }
      }
      return { balanceSatoshis: total, utxos };
    }
  } catch (e) {
    console.warn("[LTC] LitecoinSpace query warning, falling back:", e);
  }

  // 3. Fallback: BlockCypher API
  try {
    const bcRes = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${cleanAddr}?unspentOnly=true`, {
      method: "GET",
    });
    if (bcRes.ok) {
      const data = await bcRes.json();
      const balanceSatoshis = BigInt(data.final_balance || 0);
      const txrefs = data.txrefs || [];
      const utxos: LtcUtxo[] = txrefs.map((u: any) => ({
        txid: u.tx_hash,
        vout: Number(u.tx_output_n),
        value: BigInt(u.value || 0),
      }));
      return { balanceSatoshis, utxos };
    }
  } catch (e) {
    console.warn("[LTC] BlockCypher query warning:", e);
  }

  return { balanceSatoshis: 0n, utxos: [] };
}

/**
 * Broadcasts a raw LTC transaction hex via NowNodes, LitecoinSpace, or BlockCypher.
 */
export async function broadcastLtcTransaction(rawTxHex: string): Promise<string> {
  const nowNodesKey = getNowNodesApiKey();

  // 1. Try NOWNodes sendtx
  if (nowNodesKey) {
    try {
      const res = await fetch(`https://ltc.nownodes.io/api/v2/sendtx/${rawTxHex}`, {
        method: "GET",
        headers: { "api-key": nowNodesKey },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result) return String(data.result);
      }
    } catch (e) {
      console.warn("[LTC] NowNodes broadcast error, falling back:", e);
    }
  }

  // 2. Fallback: LitecoinSpace /api/tx
  try {
    const res = await fetch("https://litecoinspace.org/api/tx", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: rawTxHex,
    });
    if (res.ok) {
      const txid = await res.text();
      if (txid && txid.trim().length === 64) {
        return txid.trim();
      }
    }
  } catch (e) {
    console.warn("[LTC] LitecoinSpace broadcast error, falling back:", e);
  }

  // 3. Fallback: BlockCypher
  try {
    const res = await fetch("https://api.blockcypher.com/v1/ltc/main/txs/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx: rawTxHex }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.tx?.hash) return data.tx.hash;
    }
  } catch (e) {
    console.warn("[LTC] BlockCypher broadcast error:", e);
  }

  throw new Error("Failed to broadcast LTC transaction across all providers (NowNodes, LitecoinSpace, BlockCypher).");
}

/**
 * Constructs, signs, and broadcasts an LTC proxy sweep transaction.
 * Sends fee(s) to Treasury (and Partner if present), net to Solver, minus miner fee.
 */
export async function sweepLtcDeposit(params: {
  proxyAddress: string;
  privKeyHex: string;
  solverAddress: string;
  treasuryAddress: string;
  partnerAddress?: string | null;
  zkpayFeeSatoshis: bigint;
  partnerFeeSatoshis?: bigint;
}): Promise<string> {
  const {
    proxyAddress,
    privKeyHex,
    solverAddress,
    treasuryAddress,
    partnerAddress,
    zkpayFeeSatoshis,
    partnerFeeSatoshis = 0n,
  } = params;

  const { balanceSatoshis, utxos } = await getLtcBalanceAndUtxos(proxyAddress);
  if (utxos.length === 0 || balanceSatoshis <= 0n) {
    throw new Error(`No UTXOs found on LTC proxy address ${proxyAddress}.`);
  }

  // Standard LTC miner fee (~2000-5000 satoshis is plenty for LTC's ~1 sat/vB)
  const MINER_FEE_SATOSHIS = 3000n;

  const totalFeeSatoshis = zkpayFeeSatoshis + partnerFeeSatoshis;
  const netSolverSatoshis = balanceSatoshis - totalFeeSatoshis - MINER_FEE_SATOSHIS;

  if (netSolverSatoshis <= 0n) {
    throw new Error(
      `LTC deposit balance (${balanceSatoshis} sats) too low to cover fee (${totalFeeSatoshis} sats) and miner fee.`
    );
  }

  // Dynamically import bitcoinjs-lib and ecpair
  const bitcoin = await import("bitcoinjs-lib");
  const { ECPairFactory } = await import("ecpair");
  const ecc = await import("tiny-secp256k1");
  const ECPair = ECPairFactory(ecc);

  const cleanHex = privKeyHex.replace(/^0x/, "");
  const keyPair = ECPair.fromPrivateKey(Buffer.from(cleanHex, "hex"), { network: LITECOIN_NETWORK });

  const psbt = new bitcoin.Psbt({ network: LITECOIN_NETWORK });

  // Add inputs
  for (const utxo of utxos) {
    // For P2PKH inputs, need the previous tx or nonWitnessUtxo or scriptPubKey
    // Using standard nonWitnessUtxo or witnessUtxo
    // Since our address is standard P2PKH (starts with 'L'):
    const p2pkh = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: LITECOIN_NETWORK,
    });

    // Fetch full raw tx for nonWitnessUtxo if required by psbt
    let nonWitnessUtxo: Buffer | undefined;
    const nowNodesKey = getNowNodesApiKey();
    if (nowNodesKey) {
      try {
        const rawRes = await fetch(`https://ltc.nownodes.io/api/v2/tx-specific/${utxo.txid}`, {
          headers: { "api-key": nowNodesKey },
        });
        if (rawRes.ok) {
          const d = await rawRes.json();
          if (d?.hex) nonWitnessUtxo = Buffer.from(d.hex, "hex");
        }
      } catch {}
    }

    if (!nonWitnessUtxo) {
      // Fallback: fetch raw hex from LitecoinSpace
      try {
        const rawRes = await fetch(`https://litecoinspace.org/api/tx/${utxo.txid}/hex`);
        if (rawRes.ok) {
          const hex = await rawRes.text();
          if (hex) nonWitnessUtxo = Buffer.from(hex.trim(), "hex");
        }
      } catch {}
    }

    if (nonWitnessUtxo) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo,
      });
    } else {
      // Fallback for psbt input
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: p2pkh.output!,
          value: Number(utxo.value),
        },
      });
    }
  }

  // Output 1: Solver transfer
  psbt.addOutput({
    address: solverAddress,
    value: Number(netSolverSatoshis),
  });

  // Output 2: ZkPay Treasury fee (if > 0)
  if (zkpayFeeSatoshis > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
    psbt.addOutput({
      address: treasuryAddress,
      value: Number(zkpayFeeSatoshis),
    });
  }

  // Output 3: Partner fee (if > 0)
  if (partnerAddress && partnerFeeSatoshis > 0n) {
    psbt.addOutput({
      address: partnerAddress,
      value: Number(partnerFeeSatoshis),
    });
  }

  // Sign all inputs
  for (let i = 0; i < utxos.length; i++) {
    psbt.signInput(i, keyPair);
    psbt.validateSignaturesOfInput(i, (pubkey, msghash, signature) =>
      ecc.verify(msghash, pubkey, signature)
    );
  }

  psbt.finalizeAllInputs();
  const rawTxHex = psbt.extractTransaction().toHex();

  console.log(`[LTC] Broadcasting raw transaction: ${rawTxHex.slice(0, 100)}...`);
  const txid = await broadcastLtcTransaction(rawTxHex);
  console.log(`[LTC] ✓ Broadcast success, txid: ${txid}`);
  return txid;
}
