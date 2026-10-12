// Proves the app's [ed25519, answer] transaction layout is parsed by the deployed program.
// A random key stands in for the attestor, so the expected on-chain outcome is
// WrongAttestor (6014): reaching that error means the program found the Ed25519 instruction
// immediately before `answer` and read its offsets. A corrupted signature must instead be
// rejected by the Ed25519 precompile, and a missing instruction must give MissingEd25519 (6012).
import { ed25519 } from '@noble/curves/ed25519.js'
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
} from '@solana/kit'
import { ACTIVE_CLUSTER, PROGRAM_ID } from '../app/constants/headcount'
import {
  ACCOUNT,
  answerInstruction,
  attestationMessage,
  decodePoll,
  discriminatorBase58,
  ed25519Instruction,
  TIER_SEEKER,
  TOKEN_PROGRAM,
} from '../app/lib/headcount/program'
import { loadSigner, rpc } from './chain'

const signer = await loadSigner()
const accts = await rpc
  .getProgramAccounts(PROGRAM_ID, {
    encoding: 'base64',
    filters: [{ memcmp: { offset: 0n, bytes: discriminatorBase58(ACCOUNT.poll) as never, encoding: 'base58' } }],
  })
  .send()
if (accts.length === 0) throw new Error('no polls on chain, run seed-polls first')
const poll = decodePoll(accts[0].pubkey, Uint8Array.from(Buffer.from(accts[0].account.data[0], 'base64')))

const fakeAttestorSk = ed25519.utils.randomSecretKey()
const fakeAttestor = address(getBase58Decoder().decode(ed25519.getPublicKey(fakeAttestorSk)))
const sgt = address(getBase58Decoder().decode(ed25519.getPublicKey(ed25519.utils.randomSecretKey())))
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 600)
const msg = attestationMessage(signer.address, sgt, TIER_SEEKER, expiresAt)

const answerIx = answerInstruction({
  answerer: signer.address,
  poll,
  choice: 0,
  identity: sgt,
  tier: TIER_SEEKER,
  expiresAt,
  tokenProgram: TOKEN_PROGRAM,
})
const goodEd = ed25519Instruction({
  signature: ed25519.sign(msg, fakeAttestorSk),
  publicKey: fakeAttestor,
  message: msg,
})
const badSig = ed25519.sign(msg, fakeAttestorSk)
badSig[10] ^= 0xff
const badEd = ed25519Instruction({ signature: badSig, publicKey: fakeAttestor, message: msg })

async function simulate(ixs: Instruction[]) {
  const { value: bh } = await rpc.getLatestBlockhash().send()
  const m = pipe(
    createTransactionMessage({ version: 0 }),
    (t) => setTransactionMessageFeePayerSigner(signer, t),
    (t) => setTransactionMessageLifetimeUsingBlockhash(bh, t),
    (t) => appendTransactionMessageInstructions(ixs, t),
  )
  const tx = await signTransactionMessageWithSigners(m)
  const r = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(tx), {
      encoding: 'base64',
      sigVerify: true,
      commitment: 'confirmed',
    })
    .send()
  return JSON.stringify(r.value.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
}

const cases: [string, Instruction[], string][] = [
  ['[ed25519 valid sig by non-attestor, answer]', [goodEd, answerIx], '{"InstructionError":["1",{"Custom":"6014"}]}'],
  ['[answer] alone', [answerIx], '{"InstructionError":["0",{"Custom":"6012"}]}'],
  ['[ed25519 corrupted sig, answer]', [badEd, answerIx], '{"InstructionError":["0",{"Custom":"2"}]}'],
]
console.log(`cluster ${ACTIVE_CLUSTER.key}, poll ${poll.address}`)
let failed = 0
for (const [name, ixs, want] of cases) {
  const got = await simulate(ixs)
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}\n   expected ${want}\n   got      ${got}`)
}
if (failed) process.exit(1)
