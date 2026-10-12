import {
  createKeyPairFromBytes,
  getAddressEncoder,
  getBase58Decoder,
  getBase58Encoder,
  getPublicKeyFromAddress,
  signBytes,
  verifySignature,
  type Address,
  type SignatureBytes,
} from "@solana/kit";

export const DOMAIN = new TextEncoder().encode("headcount:v1");
export const SIGN_IN_WINDOW_SECONDS = 300;
export const ATTESTATION_TTL_SECONDS = 600;

const addressEncoder = getAddressEncoder();
const b58 = getBase58Decoder();
const b58Bytes = getBase58Encoder();

/** b"headcount:v1" || wallet(32) || sgt_mint(32) || expires_at i64 LE */
export function attestationMessage(wallet: Address, sgtMint: Address, expiresAt: bigint): Uint8Array {
  const out = new Uint8Array(DOMAIN.length + 32 + 32 + 8);
  out.set(DOMAIN, 0);
  out.set(addressEncoder.encode(wallet), DOMAIN.length);
  out.set(addressEncoder.encode(sgtMint), DOMAIN.length + 32);
  new DataView(out.buffer).setBigInt64(DOMAIN.length + 64, expiresAt, true);
  return out;
}

export function signInMessage(wallet: string, issued: number): string {
  return `headcount sign-in\nwallet: ${wallet}\nissued: ${issued}`;
}

/** Returns an error string, or null when the sign-in message is well formed and fresh. */
export function checkSignInMessage(message: string, wallet: string, nowSeconds: number): string | null {
  const m = /^headcount sign-in\nwallet: ([1-9A-HJ-NP-Za-km-z]+)\nissued: (\d{1,12})$/.exec(message);
  if (!m) return "malformed_message";
  if (m[1] !== wallet) return "wallet_mismatch";
  const issued = Number(m[2]);
  if (message !== signInMessage(wallet, issued)) return "malformed_message";
  if (Math.abs(nowSeconds - issued) > SIGN_IN_WINDOW_SECONDS) return "message_expired";
  return null;
}

export async function verifyWalletSignature(wallet: Address, message: string, signatureB58: string): Promise<boolean> {
  const sig = b58Bytes.encode(signatureB58);
  if (sig.length !== 64) return false;
  const key = await getPublicKeyFromAddress(wallet);
  return verifySignature(key, sig as SignatureBytes, new TextEncoder().encode(message));
}

export async function loadAttestorKey(secretB58: string | undefined): Promise<CryptoKeyPair> {
  if (!secretB58) throw new Error("ATTESTOR_SECRET_KEY not set");
  const bytes = b58Bytes.encode(secretB58);
  if (bytes.length !== 64) throw new Error("ATTESTOR_SECRET_KEY must be a base58 64-byte keypair");
  return createKeyPairFromBytes(bytes);
}

export async function signAttestation(
  attestor: CryptoKeyPair,
  wallet: Address,
  sgtMint: Address,
  expiresAt: bigint,
): Promise<string> {
  const sig = await signBytes(attestor.privateKey, attestationMessage(wallet, sgtMint, expiresAt));
  return b58.decode(sig);
}
