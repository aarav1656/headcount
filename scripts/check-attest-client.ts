// Runs the app's sign-in + attestation client against the live attestor with a fresh wallet that holds no SGT.
// Expected: a tier 0 attestation whose identity is the wallet, verified against the trusted attestor key.
// A forged wallet signature must be rejected.
import { generateKeyPair, getAddressFromPublicKey, signBytes } from '@solana/kit'
import { ATTEST_URL } from '../app/constants/headcount'
import { requestAttestation, signInMessage } from '../app/lib/headcount/attest'
import { TIER_WALLET } from '../app/lib/headcount/program'

const kp = await generateKeyPair()
const wallet = await getAddressFromPublicKey(kp.publicKey)
const message = signInMessage(wallet, Math.floor(Date.now() / 1000))
const sig = Uint8Array.from(await signBytes(kp.privateKey, new TextEncoder().encode(message)))
console.log('attest url', ATTEST_URL)

const att = await requestAttestation(wallet, message, sig)
if (att.tier !== TIER_WALLET || att.identity !== wallet) throw new Error(`expected tier 0 with identity == wallet, got ${JSON.stringify({ tier: att.tier, identity: att.identity })}`)
console.log(`PASS valid sign-in, no SGT -> tier ${att.tier}, identity == wallet ${att.identity}, expires ${att.expiresAt}`)

const forged = sig.slice()
forged[0] ^= 0xff
try {
  await requestAttestation(wallet, message, forged)
  throw new Error('forged signature was accepted')
} catch (e) {
  if (!(e instanceof Error) || !/could not be verified/.test(e.message)) throw e
  console.log('PASS forged signature ->', e.message)
}
