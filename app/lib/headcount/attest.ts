import { ed25519 } from '@noble/curves/ed25519.js'
import { address, getAddressEncoder, getBase58Decoder, getBase58Encoder, isAddress, type Address } from '@solana/kit'
import { ATTEST_URL, ATTESTOR_PUBKEY } from '@/constants/headcount'
import { attestationMessage } from './program'

const b58 = getBase58Decoder()
const b58Bytes = getBase58Encoder()
const addrBytes = getAddressEncoder()

export type Attestation = {
  sgtMint: Address
  expiresAt: bigint
  signature: Uint8Array
}

export class NoSeekerTokenError extends Error {
  constructor() {
    super('no_seeker_genesis_token')
  }
}

const API_MESSAGES: Record<string, string> = {
  bad_signature: 'Your wallet signature could not be verified. Try again.',
  message_expired: 'Your device clock is off by more than five minutes. Fix the time and try again.',
  rpc_unavailable: 'Headcount could not check your Seeker token right now. Try again in a minute.',
  attestor_not_configured: 'The Headcount attestor is not available right now.',
  malformed_message: 'The sign-in message was rejected. Update the app and try again.',
  wallet_mismatch: 'The sign-in message was rejected. Update the app and try again.',
  bad_request: 'The sign-in request was rejected. Update the app and try again.',
}

export function signInMessage(wallet: Address, issuedSeconds: number): string {
  return `headcount sign-in\nwallet: ${wallet}\nissued: ${issuedSeconds}`
}

export async function requestAttestation(
  wallet: Address,
  message: string,
  walletSignature: Uint8Array,
): Promise<Attestation> {
  let res: Response
  try {
    res = await fetch(ATTEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, message, signature: b58.decode(walletSignature) }),
    })
  } catch {
    throw new Error('Network request failed')
  }
  let body: Record<string, unknown> = {}
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  if (res.status === 403 && body.error === 'no_seeker_genesis_token') throw new NoSeekerTokenError()
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `http_${res.status}`
    throw new Error(API_MESSAGES[code] ?? `The attestor returned an error (${code}).`)
  }

  const { sgtMint, expiresAt, attestorPubkey, signature } = body
  if (
    typeof sgtMint !== 'string' ||
    !isAddress(sgtMint) ||
    typeof signature !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    throw new Error('The attestor returned an unexpected response.')
  }
  if (attestorPubkey !== ATTESTOR_PUBKEY) throw new Error('The attestor key does not match the one this app trusts.')
  const sig = Uint8Array.from(b58Bytes.encode(signature))
  const exp = BigInt(expiresAt)
  if (sig.length !== 64) throw new Error('The attestor returned a malformed signature.')
  const ok = ed25519.verify(
    sig,
    attestationMessage(wallet, address(sgtMint), exp),
    Uint8Array.from(addrBytes.encode(ATTESTOR_PUBKEY)),
  )
  if (!ok) throw new Error('The attestor signature did not verify.')
  return { sgtMint: address(sgtMint), expiresAt: exp, signature: sig }
}

/**
 * A wallet's signMessages result is the message with the 64-byte signature appended.
 * Some wallets return only the signature, so both shapes are accepted.
 */
export function extractSignature(signed: Uint8Array, message: Uint8Array): Uint8Array {
  if (signed.length === 64) return signed
  if (signed.length === message.length + 64) return signed.slice(message.length)
  throw new Error('The wallet returned an unexpected signed message.')
}

export function verifyWalletSignature(wallet: Address, message: Uint8Array, signature: Uint8Array): boolean {
  return ed25519.verify(signature, message, Uint8Array.from(addrBytes.encode(wallet)))
}
