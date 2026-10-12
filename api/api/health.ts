import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAddressFromPublicKey } from "@solana/kit";
import { loadAttestorKey } from "../lib/attest";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const key = await loadAttestorKey(process.env.ATTESTOR_SECRET_KEY);
    return res.status(200).json({
      ok: true,
      attestorPubkey: await getAddressFromPublicKey(key.publicKey),
      cluster: "mainnet-beta",
    });
  } catch {
    return res.status(500).json({ ok: false, error: "attestor_not_configured" });
  }
}
