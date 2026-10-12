// Runs the app's sign-in + attestation client against the live attestor with a fresh wallet that holds no SGT.
// Expected: 403 no_seeker_genesis_token surfaces as NoSeekerTokenError. A forged signature must fail differently.
import { generateKeyPair, getAddressFromPublicKey, signBytes } from '@solana/kit'
import { ATTEST_URL } from '../app/constants/headcount'
import { NoSeekerTokenError, requestAttestation, signInMessage } from '../app/lib/headcount/attest'

const kp = await generateKeyPair()
const wallet = await getAddressFromPublicKey(kp.publicKey)
const message = signInMessage(wallet, Math.floor(Date.now() / 1000))
const sig = Uint8Array.from(await signBytes(kp.privateKey, new TextEncoder().encode(message)))
console.log('attest url', ATTEST_URL)

try {
  await requestAttestation(wallet, message, sig)
  throw new Error('expected a rejection for a wallet without an SGT')
} catch (e) {
  if (!(e instanceof NoSeekerTokenError)) throw e
  console.log('PASS valid sign-in, no SGT -> NoSeekerTokenError (403 no_seeker_genesis_token)')
}

const forged = sig.slice()
forged[0] ^= 0xff
try {
  await requestAttestation(wallet, message, forged)
  throw new Error('forged signature was accepted')
} catch (e) {
  if (e instanceof NoSeekerTokenError || !(e instanceof Error) || !/could not be verified/.test(e.message)) throw e
  console.log('PASS forged signature ->', e.message)
}
