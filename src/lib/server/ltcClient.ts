import crypto from "crypto";
import { Buffer } from "buffer";
import { getNowNodesApiKey } from "./rpcConfig";

export interface LtcUtxo {
  txid: string;
  vout: number;
  value: bigint; // in satoshis (1 LTC = 100_000_000 satoshis)
  scriptPubKey?: string;
  confirmed?: boolean;
  confirmations?: number;
}

export interface LtcBalanceResult {
  balanceSatoshis: bigint;
  confirmedBalanceSatoshis: bigint;
  unconfirmedBalanceSatoshis: bigint;
  utxos: LtcUtxo[];
  confirmedUtxos: LtcUtxo[];
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

// Standard Litecoin P2PKH dust relay limit (5,460 satoshis).
// Any transaction output below this threshold is rejected by Litecoin Core nodes with 'dust (code 64)'.
export const LTC_DUST_THRESHOLD_SATOSHIS = 5460n;

/**
 * Queries LTC address balance and UTXOs using NowNodes with failovers to LitecoinSpace and BlockCypher.
 */
export async function getLtcBalanceAndUtxos(address: string): Promise<LtcBalanceResult> {
  const cleanAddr = address.trim();
  const nowNodesKey = getNowNodesApiKey();

  // 1. Try LitecoinSpace first (real-time mempool.space indexer for LTC, detects unconfirmed txs instantly)
  try {
    const utxoRes = await fetch(`https://litecoinspace.org/api/address/${cleanAddr}/utxo`, {
      method: "GET",
    });
    if (utxoRes.ok) {
      const rawUtxos = await utxoRes.json();
      let total = 0n;
      let confirmedTotal = 0n;
      let unconfirmedTotal = 0n;
      const utxos: LtcUtxo[] = [];
      const confirmedUtxos: LtcUtxo[] = [];
      if (Array.isArray(rawUtxos)) {
        for (const u of rawUtxos) {
          const val = BigInt(u.value || 0);
          const isConfirmed = Boolean(u?.status?.confirmed);
          total += val;
          const item: LtcUtxo = {
            txid: u.txid,
            vout: Number(u.vout),
            value: val,
            confirmed: isConfirmed,
            confirmations: isConfirmed ? 1 : 0,
          };
          utxos.push(item);
          if (isConfirmed) {
            confirmedTotal += val;
            confirmedUtxos.push(item);
          } else {
            unconfirmedTotal += val;
          }
        }
      }
      if (utxos.length > 0) {
        return {
          balanceSatoshis: total,
          confirmedBalanceSatoshis: confirmedTotal,
          unconfirmedBalanceSatoshis: unconfirmedTotal,
          utxos,
          confirmedUtxos,
        };
      }
    }
  } catch (e) {
    console.warn("[LTC] LitecoinSpace query warning, falling back:", e);
  }

  // 2. Fallback: NOWNodes Blockbook API
  if (nowNodesKey) {
    try {
      const res = await fetch(`https://ltc.nownodes.io/api/v2/address/${cleanAddr}?details=basic`, {
        method: "GET",
        headers: { "api-key": nowNodesKey },
      });
      if (res.ok) {
        const data = await res.json();
        const confirmedBal = BigInt(data.balance || "0");
        const unconfirmedBal = BigInt(data.unconfirmedBalance || "0");
        const balanceSatoshis = confirmedBal + (unconfirmedBal > 0n ? unconfirmedBal : 0n);
        
        // If balance > 0, fetch UTXOs from NOWNodes
        if (balanceSatoshis > 0n) {
          const utxoRes = await fetch(`https://ltc.nownodes.io/api/v2/utxo/${cleanAddr}`, {
            method: "GET",
            headers: { "api-key": nowNodesKey },
          });
          if (utxoRes.ok) {
            const rawUtxos = await utxoRes.json();
            let confSum = 0n;
            let unconfSum = 0n;
            const utxos: LtcUtxo[] = [];
            const confirmedUtxos: LtcUtxo[] = [];
            for (const u of Array.isArray(rawUtxos) ? rawUtxos : []) {
              const val = BigInt(u.value || "0");
              const confs = Number(u.confirmations ?? 0);
              const isConfirmed = Number.isFinite(confs) && confs >= 1;
              const item: LtcUtxo = {
                txid: u.txid,
                vout: Number(u.vout),
                value: val,
                confirmed: isConfirmed,
                confirmations: Number.isFinite(confs) && confs >= 0 ? confs : 0,
              };
              utxos.push(item);
              if (isConfirmed) {
                confSum += val;
                confirmedUtxos.push(item);
              } else {
                unconfSum += val;
              }
            }
            if (utxos.length > 0) {
              return {
                balanceSatoshis,
                confirmedBalanceSatoshis: confSum,
                unconfirmedBalanceSatoshis: unconfSum,
                utxos,
                confirmedUtxos,
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn("[LTC] NowNodes query warning, falling back:", e);
    }
  }

  // 3. Fallback: BlockCypher API
  try {
    const bcRes = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${cleanAddr}?unspentOnly=true`, {
      method: "GET",
    });
    if (bcRes.ok) {
      const data = await bcRes.json();
      const balanceSatoshis = BigInt(data.final_balance || 0);
      const confirmedRefs = Array.isArray(data.txrefs) ? data.txrefs : [];
      const unconfirmedRefs = Array.isArray(data.unconfirmed_txrefs) ? data.unconfirmed_txrefs : [];
      let confSum = 0n;
      let unconfSum = 0n;
      const utxos: LtcUtxo[] = [];
      const confirmedUtxos: LtcUtxo[] = [];
      for (const u of confirmedRefs) {
        const val = BigInt(u.value || 0);
        const confs = Number(u.confirmations ?? 0);
        const isConfirmed = Number.isFinite(confs) && confs >= 1;
        const item: LtcUtxo = {
          txid: u.tx_hash,
          vout: Number(u.tx_output_n),
          value: val,
          confirmed: isConfirmed,
          confirmations: Number.isFinite(confs) && confs >= 0 ? confs : 0,
        };
        utxos.push(item);
        if (isConfirmed) {
          confSum += val;
          confirmedUtxos.push(item);
        } else {
          unconfSum += val;
        }
      }
      for (const u of unconfirmedRefs) {
        const val = BigInt(u.value || 0);
        const item: LtcUtxo = {
          txid: u.tx_hash,
          vout: Number(u.tx_output_n),
          value: val,
          confirmed: false,
          confirmations: 0,
        };
        utxos.push(item);
        unconfSum += val;
      }
      return {
        balanceSatoshis,
        confirmedBalanceSatoshis: confSum,
        unconfirmedBalanceSatoshis: unconfSum,
        utxos,
        confirmedUtxos,
      };
    }
  } catch (e) {
    console.warn("[LTC] BlockCypher query warning:", e);
  }

  return {
    balanceSatoshis: 0n,
    confirmedBalanceSatoshis: 0n,
    unconfirmedBalanceSatoshis: 0n,
    utxos: [],
    confirmedUtxos: [],
  };
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
  confirmedOnly?: boolean;
}): Promise<string> {
  const {
    proxyAddress,
    privKeyHex,
    solverAddress,
    treasuryAddress,
    partnerAddress,
    zkpayFeeSatoshis,
    partnerFeeSatoshis = 0n,
    confirmedOnly = false,
  } = params;

  const balInfo = await getLtcBalanceAndUtxos(proxyAddress);
  const utxos = confirmedOnly ? balInfo.confirmedUtxos : balInfo.utxos;
  const balanceSatoshis = confirmedOnly ? balInfo.confirmedBalanceSatoshis : balInfo.balanceSatoshis;
  if (utxos.length === 0 || balanceSatoshis <= 0n) {
    throw new Error(`No ${confirmedOnly ? "confirmed " : ""}UTXOs found on LTC proxy address ${proxyAddress}.`);
  }

  // Standard LTC miner fee (~2000-5000 satoshis is plenty for LTC's ~1 sat/vB)
  const MINER_FEE_SATOSHIS = 3000n;

  let effectiveZkpayFee = zkpayFeeSatoshis;
  let effectivePartnerFee = partnerFeeSatoshis;

  // 1. If treasury address is same as proxy address, do not send fee back to proxy
  if (treasuryAddress.toLowerCase() === proxyAddress.toLowerCase()) {
    effectiveZkpayFee = 0n;
  }

  // 2. If ZkPay fee is below dust limit (5,460 sats), do NOT create a dust output; roll into solver
  if (effectiveZkpayFee < LTC_DUST_THRESHOLD_SATOSHIS) {
    if (effectiveZkpayFee > 0n) {
      console.log(
        `[LTC] ZkPay fee (${effectiveZkpayFee} sats) below dust limit (${LTC_DUST_THRESHOLD_SATOSHIS} sats); rolling into solver amount.`
      );
    }
    effectiveZkpayFee = 0n;
  }

  // 3. If Partner fee is below dust limit or partner address is invalid/proxy, roll into solver
  if (
    !partnerAddress ||
    partnerAddress.toLowerCase() === proxyAddress.toLowerCase() ||
    effectivePartnerFee < LTC_DUST_THRESHOLD_SATOSHIS
  ) {
    if (effectivePartnerFee > 0n) {
      console.log(
        `[LTC] Partner fee (${effectivePartnerFee} sats) below dust limit (${LTC_DUST_THRESHOLD_SATOSHIS} sats); rolling into solver amount.`
      );
    }
    effectivePartnerFee = 0n;
  }

  const totalFeeSatoshis = effectiveZkpayFee + effectivePartnerFee;
  const netSolverSatoshis = balanceSatoshis - totalFeeSatoshis - MINER_FEE_SATOSHIS;

  if (netSolverSatoshis < LTC_DUST_THRESHOLD_SATOSHIS) {
    throw new Error(
      `LTC solver output (${netSolverSatoshis} sats) is below the dust threshold (${LTC_DUST_THRESHOLD_SATOSHIS} sats). Deposit balance: ${balanceSatoshis} sats.`
    );
  }

  // Dynamically import bitcoinjs-lib, ecpair, and pureSecp256k1
  const bitcoin = await import("bitcoinjs-lib");
  const { ECPairFactory } = await import("ecpair");
  const { pureSecp256k1 } = await import("./pureSecp256k1");

  try {
    if (typeof (bitcoin as any).initEccLib === "function") {
      (bitcoin as any).initEccLib(pureSecp256k1);
    }
  } catch {}

  const ECPair = ECPairFactory(pureSecp256k1 as any);

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
      // Fallback 1: fetch raw hex from LitecoinSpace
      try {
        const rawRes = await fetch(`https://litecoinspace.org/api/tx/${utxo.txid}/hex`);
        if (rawRes.ok) {
          const hex = await rawRes.text();
          if (hex) nonWitnessUtxo = Buffer.from(hex.trim(), "hex");
        }
      } catch {}
    }

    if (!nonWitnessUtxo) {
      // Fallback 2: fetch raw hex from BlockCypher
      try {
        const bcRes = await fetch(`https://api.blockcypher.com/v1/ltc/main/txs/${utxo.txid}?includeHex=true`);
        if (bcRes.ok) {
          const d = await bcRes.json();
          if (d?.hex) nonWitnessUtxo = Buffer.from(d.hex, "hex");
        }
      } catch {}
    }

    if (!nonWitnessUtxo) {
      throw new Error(
        `Unable to fetch raw transaction for UTXO ${utxo.txid}. Cannot safely sign legacy P2PKH input without nonWitnessUtxo.`
      );
    }

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo,
    });
  }

  const normalizeLtcOutAddr = (a: string) => {
    const t = a.trim();
    return t.toLowerCase().startsWith("ltc1") ? t.toLowerCase() : t;
  };

  // Output 1: Solver transfer
  psbt.addOutput({
    address: normalizeLtcOutAddr(solverAddress),
    value: Number(netSolverSatoshis),
  });

  // Output 2: ZkPay Treasury fee (if >= dust threshold and not solver address)
  if (effectiveZkpayFee >= LTC_DUST_THRESHOLD_SATOSHIS && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
    psbt.addOutput({
      address: normalizeLtcOutAddr(treasuryAddress),
      value: Number(effectiveZkpayFee),
    });
  }

  // Output 3: Partner fee (if >= dust threshold)
  if (partnerAddress && effectivePartnerFee >= LTC_DUST_THRESHOLD_SATOSHIS) {
    psbt.addOutput({
      address: normalizeLtcOutAddr(partnerAddress),
      value: Number(effectivePartnerFee),
    });
  }

  // Sign all inputs
  for (let i = 0; i < utxos.length; i++) {
    psbt.signInput(i, keyPair);
    psbt.validateSignaturesOfInput(i, (pubkey, msghash, signature) =>
      pureSecp256k1.verify(msghash, pubkey, signature)
    );
  }

  psbt.finalizeAllInputs();
  const rawTxHex = psbt.extractTransaction().toHex();

  console.log(`[LTC] Broadcasting raw transaction: ${rawTxHex.slice(0, 100)}...`);
  const txid = await broadcastLtcTransaction(rawTxHex);
  console.log(`[LTC] ✓ Broadcast success, txid: ${txid}`);
  return txid;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58Ltc(source: Uint8Array | Buffer): string {
  if (source.length === 0) return "";
  let x = 0n;
  for (let i = 0; i < source.length; i++) {
    x = (x << 8n) | BigInt(source[i]);
  }
  let str = "";
  while (x > 0n) {
    const mod = Number(x % 58n);
    x = x / 58n;
    str = BASE58_ALPHABET[mod] + str;
  }
  for (let i = 0; i < source.length && source[i] === 0; i++) {
    str = "1" + str;
  }
  return str;
}

function decodeBase58Ltc(str: string): Buffer {
  if (str.length === 0) return Buffer.alloc(0);
  let x = 0n;
  for (let i = 0; i < str.length; i++) {
    const val = BASE58_ALPHABET.indexOf(str[i]);
    if (val === -1) throw new Error(`Invalid Base58 character: ${str[i]}`);
    x = x * 58n + BigInt(val);
  }
  const bytes: number[] = [];
  while (x > 0n) {
    bytes.push(Number(x & 0xffn));
    x >>= 8n;
  }
  bytes.reverse();
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === "1"; i++) leadingZeros++;
  const result = Buffer.alloc(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) result[leadingZeros + i] = bytes[i];
  return result;
}

/**
 * Parses a Litecoin private key from either 32-byte hex (with/without 0x) or Base58Check WIF.
 */
export function parseLtcPrivateKeyHex(privKeyInput: string): string {
  let clean = (privKeyInput || "").trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  const noPrefix = clean.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(noPrefix)) {
    return noPrefix.toLowerCase();
  }

  // Decode WIF (1 byte version 0xb0 or 0x80 + 32 byte key + optional 0x01 compressed flag + 4 byte checksum)
  const decoded = decodeBase58Ltc(clean);
  if (decoded.length !== 37 && decoded.length !== 38) {
    throw new Error("Invalid Litecoin private key format (expected 64-char hex or WIF).");
  }
  const payload = decoded.subarray(0, decoded.length - 4);
  const checksum = decoded.subarray(decoded.length - 4);
  const h1 = crypto.createHash("sha256").update(payload).digest();
  const h2 = crypto.createHash("sha256").update(h1).digest();
  if (!h2.subarray(0, 4).equals(checksum)) {
    throw new Error("Invalid Litecoin WIF checksum.");
  }
  return payload.subarray(1, 33).toString("hex");
}

/**
 * Derives the Litecoin mainnet P2PKH ('L...') address from a 32-byte hex or WIF private key.
 */
export function deriveLtcAddressFromPrivKey(privKeyInput: string): string {
  const hex = parseLtcPrivateKeyHex(privKeyInput);
  const privBuf = Buffer.from(hex, "hex");
  const ecdh = crypto.createECDH("secp256k1");
  ecdh.setPrivateKey(privBuf);
  const compressedPub = Buffer.from(ecdh.getPublicKey(null, "compressed"));
  const sha = crypto.createHash("sha256").update(compressedPub).digest();
  const ripemd = crypto.createHash("ripemd160").update(sha).digest();
  const payload = Buffer.concat([Buffer.from([0x30]), ripemd]);
  const check1 = crypto.createHash("sha256").update(payload).digest();
  const check2 = crypto.createHash("sha256").update(check1).digest();
  return encodeBase58Ltc(Buffer.concat([payload, check2.subarray(0, 4)]));
}

/**
 * Sends a specific amount of LTC from the Liquidity Hot Wallet to `toAddress`,
 * returning remaining change back to `fromAddress`.
 */
export async function sendLtcFromLiquidityWallet(params: {
  fromAddress: string;
  privKeyInput: string;
  toAddress: string;
  amountSatoshis: bigint;
}): Promise<string> {
  const { fromAddress, privKeyInput, toAddress, amountSatoshis } = params;
  if (amountSatoshis < LTC_DUST_THRESHOLD_SATOSHIS) {
    throw new Error(
      `LTC payout amount (${amountSatoshis} sats) is below dust limit (${LTC_DUST_THRESHOLD_SATOSHIS} sats).`
    );
  }

  const privKeyHex = parseLtcPrivateKeyHex(privKeyInput);
  const { balanceSatoshis, utxos, confirmedUtxos } = await getLtcBalanceAndUtxos(fromAddress);
  if (utxos.length === 0 || balanceSatoshis < amountSatoshis) {
    throw new Error(
      `Insufficient LTC balance in liquidity wallet (${balanceSatoshis} sats < ${amountSatoshis} sats).`
    );
  }

  // Prefer confirmed UTXOs first, then unconfirmed change UTXOs from our own hot wallet if needed
  const orderedPool = [
    ...confirmedUtxos.slice().sort((a, b) => (b.value > a.value ? 1 : -1)),
    ...utxos.filter((u) => !u.confirmed).sort((a, b) => (b.value > a.value ? 1 : -1)),
  ];

  const selected: LtcUtxo[] = [];
  let selectedSum = 0n;
  let minerFee = 3000n;

  for (const u of orderedPool) {
    selected.push(u);
    selectedSum += u.value;
    minerFee = BigInt(selected.length) * 350n + 2650n;
    if (selectedSum >= amountSatoshis + minerFee) {
      break;
    }
  }

  if (selectedSum < amountSatoshis + minerFee) {
    throw new Error(
      `Insufficient spendable LTC after miner fee (${selectedSum} sats < ${amountSatoshis + minerFee} sats).`
    );
  }

  const changeSatoshis = selectedSum - amountSatoshis - minerFee;

  const bitcoin = await import("bitcoinjs-lib");
  const { ECPairFactory } = await import("ecpair");
  const { pureSecp256k1 } = await import("./pureSecp256k1");

  try {
    if (typeof (bitcoin as any).initEccLib === "function") {
      (bitcoin as any).initEccLib(pureSecp256k1);
    }
  } catch {}

  const ECPair = ECPairFactory(pureSecp256k1 as any);
  const keyPair = ECPair.fromPrivateKey(Buffer.from(privKeyHex, "hex"), {
    network: LITECOIN_NETWORK,
  });
  const psbt = new bitcoin.Psbt({ network: LITECOIN_NETWORK });
  const nowNodesKey = getNowNodesApiKey();

  for (const utxo of selected) {
    let nonWitnessUtxo: Buffer | undefined;
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
      try {
        const rawRes = await fetch(`https://litecoinspace.org/api/tx/${utxo.txid}/hex`);
        if (rawRes.ok) {
          const hex = await rawRes.text();
          if (hex) nonWitnessUtxo = Buffer.from(hex.trim(), "hex");
        }
      } catch {}
    }
    if (!nonWitnessUtxo) {
      try {
        const bcRes = await fetch(
          `https://api.blockcypher.com/v1/ltc/main/txs/${utxo.txid}?includeHex=true`
        );
        if (bcRes.ok) {
          const d = await bcRes.json();
          if (d?.hex) nonWitnessUtxo = Buffer.from(d.hex, "hex");
        }
      } catch {}
    }
    if (!nonWitnessUtxo) {
      throw new Error(`Unable to fetch raw transaction hex for LTC UTXO ${utxo.txid}.`);
    }

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo,
    });
  }

  const normalizeLtcOutAddr = (a: string) => {
    const t = a.trim();
    return t.toLowerCase().startsWith("ltc1") ? t.toLowerCase() : t;
  };

  psbt.addOutput({
    address: normalizeLtcOutAddr(toAddress),
    value: Number(amountSatoshis),
  });

  if (changeSatoshis >= LTC_DUST_THRESHOLD_SATOSHIS) {
    psbt.addOutput({
      address: normalizeLtcOutAddr(fromAddress),
      value: Number(changeSatoshis),
    });
  }

  for (let i = 0; i < selected.length; i++) {
    psbt.signInput(i, keyPair);
    psbt.validateSignaturesOfInput(i, (pubkey, msghash, signature) =>
      pureSecp256k1.verify(msghash, pubkey, signature)
    );
  }

  psbt.finalizeAllInputs();
  const rawTxHex = psbt.extractTransaction().toHex();
  const txid = await broadcastLtcTransaction(rawTxHex);
  console.log(
    `[LTC Liquidity] ✓ Sent ${amountSatoshis} sats to ${toAddress} (change: ${changeSatoshis} sats), txid: ${txid}`
  );
  return txid;
}
