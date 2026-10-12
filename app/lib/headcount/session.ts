import type { Address } from '@solana/kit'
import { requestAttestation, signInMessage, verifyWalletSignature, extractSignature, type Attestation } from './attest'

// The wallet signs the sign-in message once and the attestation is reused across polls until
// it is close to expiring. Both live in memory only, so a fresh app start asks again.
const SIGN_IN_REUSE_SECONDS = 240
const ATTESTATION_MARGIN_SECONDS = 120

type SignIn = { message: string; messageBytes: Uint8Array; signature: Uint8Array; issued: number }

const signIns = new Map<Address, SignIn>()
const attestations = new Map<Address, Attestation>()

const nowSeconds = () => Math.floor(Date.now() / 1000)

export function cachedAttestation(wallet: Address): Attestation | null {
  const a = attestations.get(wallet)
  if (!a) return null
  return Number(a.expiresAt) - nowSeconds() > ATTESTATION_MARGIN_SECONDS ? a : null
}

export function forgetSession(wallet?: Address) {
  if (wallet) {
    signIns.delete(wallet)
    attestations.delete(wallet)
  } else {
    signIns.clear()
    attestations.clear()
  }
}

export async function getAttestation(
  wallet: Address,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  onStep: (step: 'signing' | 'checking') => void,
): Promise<Attestation> {
  const hit = cachedAttestation(wallet)
  if (hit) return hit

  let signIn = signIns.get(wallet)
  if (!signIn || nowSeconds() - signIn.issued > SIGN_IN_REUSE_SECONDS) {
    onStep('signing')
    const issued = nowSeconds()
    const message = signInMessage(wallet, issued)
    const messageBytes = new TextEncoder().encode(message)
    const signature = extractSignature(await signMessage(messageBytes), messageBytes)
    if (!verifyWalletSignature(wallet, messageBytes, signature))
      throw new Error('Your wallet returned a signature that does not verify.')
    signIn = { message, messageBytes, signature, issued }
    signIns.set(wallet, signIn)
  }

  onStep('checking')
  const attestation = await requestAttestation(wallet, signIn.message, signIn.signature)
  attestations.set(wallet, attestation)
  return attestation
}
