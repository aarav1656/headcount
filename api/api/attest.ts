import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAddressFromPublicKey, isAddress } from "@solana/kit";
import {
  ATTESTATION_TTL_SECONDS,
  checkSignInMessage,
  loadAttestorKey,
  signAttestation,
  verifyWalletSignature,
} from "../lib/attest";
import { DEFAULT_RPC, lookupSgt } from "../lib/sgt";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const { wallet, message, signature } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof wallet !== "string" || !isAddress(wallet) || typeof message !== "string" || typeof signature !== "string") {
    return res.status(400).json({ error: "bad_request" });
  }

  const now = Math.floor(Date.now() / 1000);
  const msgErr = checkSignInMessage(message, wallet, now);
  if (msgErr) return res.status(400).json({ error: msgErr });

  let valid = false;
  try {
    valid = await verifyWalletSignature(wallet, message, signature);
  } catch {
    valid = false;
  }
  if (!valid) return res.status(401).json({ error: "bad_signature" });

  let attestor: CryptoKeyPair;
  try {
    attestor = await loadAttestorKey(process.env.ATTESTOR_SECRET_KEY);
  } catch (e) {
    console.error("attestor key", (e as Error).message);
    return res.status(500).json({ error: "attestor_not_configured" });
  }

  let lookup;
  try {
    lookup = await lookupSgt(wallet, process.env.MAINNET_RPC_URL || DEFAULT_RPC);
  } catch (e) {
    console.error("sgt lookup", (e as Error).message);
    return res.status(502).json({ error: "rpc_unavailable" });
  }
  if (!lookup.found) return res.status(403).json({ error: "no_seeker_genesis_token" });

  const expiresAt = BigInt(now + ATTESTATION_TTL_SECONDS);
  return res.status(200).json({
    sgtMint: lookup.sgtMint,
    expiresAt: Number(expiresAt),
    attestorPubkey: await getAddressFromPublicKey(attestor.publicKey),
    signature: await signAttestation(attestor, wallet, lookup.sgtMint, expiresAt),
  });
}
