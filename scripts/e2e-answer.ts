// Full devnet answer-and-earn loop for a wallet that holds no Seeker Genesis Token:
// fresh wallet -> fund 0.05 SOL -> sign-in -> LIVE attestor -> [ed25519, answer] on an open poll
// -> tally +1 and reward paid; the same wallet on a seekers-only poll fails with SeekersOnly (6019).
import { AccountRole, generateKeyPairSigner, signBytes, type Address, type Instruction } from '@solana/kit'
import { ACTIVE_CLUSTER, ATTEST_URL, ATTESTOR_PUBKEY, PROGRAM_ID } from '../app/constants/headcount'
import { requestAttestation, signInMessage } from '../app/lib/headcount/attest'
import { describeSimulationError } from '../app/lib/headcount/errors'
import {
  ACCOUNT,
  answerAddress,
  answerInstruction,
  ataAddress,
  attestationMessage,
  decodeAnswer,
  decodePoll,
  discriminatorBase58,
  ed25519Instruction,
  SYSTEM_PROGRAM,
  TIER_WALLET,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  type Poll,
} from '../app/lib/headcount/program'
import { fetchData, loadSigner, rpc, sendAndConfirm } from './chain'

const FUND_LAMPORTS = 50_000_000n
const SEEKERS_ONLY_ERROR = 6019

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function transfer(from: Address, to: Address, lamports: bigint): Instruction {
  const data = new Uint8Array(12)
  const dv = new DataView(data.buffer)
  dv.setUint32(0, 2, true)
  dv.setBigUint64(4, lamports, true)
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: from, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data,
  }
}

async function listPolls(): Promise<Poll[]> {
  const accts = await rpc
    .getProgramAccounts(PROGRAM_ID, {
      encoding: 'base64',
      commitment: 'confirmed',
      filters: [{ memcmp: { offset: 0n, bytes: discriminatorBase58(ACCOUNT.poll) as never, encoding: 'base58' } }],
    })
    .send()
  return accts.map((a) => decodePoll(a.pubkey, Uint8Array.from(Buffer.from(a.account.data[0], 'base64'))))
}

const lamports = async (a: Address) => (await rpc.getBalance(a, { commitment: 'confirmed' }).send()).value

async function tokenBalance(owner: Address, mint: Address, tokenProgram: Address): Promise<bigint | null> {
  const d = await fetchData(ataAddress(owner, mint, tokenProgram))
  if (!d) return null
  return new DataView(d.buffer, d.byteOffset).getBigUint64(64, true)
}

const funder = await loadSigner()
const wallet = await generateKeyPairSigner()
console.log(`cluster ${ACTIVE_CLUSTER.key} program ${PROGRAM_ID}`)
console.log(`attestor ${ATTEST_URL}`)
console.log(`fresh wallet ${wallet.address}`)

const polls = await listPolls()
const openPoll = polls.find((p) => !p.seekersOnly && !p.closed && p.answers < p.maxAnswers)
const seekersPoll = polls.find((p) => p.seekersOnly && !p.closed && p.answers < p.maxAnswers)
assert(openPoll, 'an open poll exists on chain')
assert(seekersPoll, 'a seekers-only poll exists on chain')
console.log(`open poll        ${openPoll.address} "${openPoll.question}"`)
console.log(`seekers-only poll ${seekersPoll.address} "${seekersPoll.question}"`)

const mintAcct = await rpc.getAccountInfo(openPoll.rewardMint, { encoding: 'base64', commitment: 'confirmed' }).send()
assert(mintAcct.value, 'reward mint exists')
const tokenProgram = mintAcct.value.owner as Address
assert(tokenProgram === TOKEN_PROGRAM || tokenProgram === TOKEN_2022_PROGRAM, 'reward mint is owned by a token program')

// 1. fund the fresh wallet from the default wallet
const fundSig = await sendAndConfirm(funder, [transfer(funder.address, wallet.address, FUND_LAMPORTS)])
const funded = await lamports(wallet.address)
assert(funded === FUND_LAMPORTS, `wallet funded with exactly 0.05 SOL (has ${funded})`)
console.log(`funded ${funded} lamports, signature ${fundSig}`)
assert((await tokenBalance(wallet.address, openPoll.rewardMint, tokenProgram)) === null, 'wallet starts with no reward account')

try {
  // 2. sign-in -> live attestor
  const message = signInMessage(wallet.address, Math.floor(Date.now() / 1000))
  const walletSig = await signBytes(wallet.keyPair.privateKey, new TextEncoder().encode(message))
  const att = await requestAttestation(wallet.address, message, Uint8Array.from(walletSig))
  assert(att.tier === TIER_WALLET, `live attestor returned tier 0 (got ${att.tier})`)
  assert(att.identity === wallet.address, 'tier 0 identity is the wallet')
  console.log(`attestation tier ${att.tier}, identity ${att.identity}, expiresAt ${att.expiresAt}`)

  const attestMessage = attestationMessage(wallet.address, att.identity, att.tier, att.expiresAt)
  const ixs = (poll: Poll, choice: number): Instruction[] => [
    ed25519Instruction({ signature: att.signature, publicKey: ATTESTOR_PUBKEY, message: attestMessage }),
    answerInstruction({
      answerer: wallet.address,
      poll,
      choice,
      identity: att.identity,
      tier: att.tier,
      expiresAt: att.expiresAt,
      tokenProgram,
    }),
  ]

  // 3. answer the open poll
  const CHOICE = 1
  const before = openPoll
  const answerSig = await sendAndConfirm(wallet, ixs(openPoll, CHOICE))
  console.log(`answer signature ${answerSig}`)
  const after = (await listPolls()).find((p) => p.address === openPoll.address)
  assert(after, 'open poll still readable')
  const expectTallies = before.tallies.map((v, i) => (i === CHOICE ? v + 1 : v))
  assert(after.answers === before.answers + 1, `answers ${before.answers} -> ${after.answers}`)
  assert(same(after.tallies, expectTallies), `tallies ${before.tallies} -> ${after.tallies}`)
  assert(same(after.seekerTallies, before.seekerTallies), 'seeker tallies untouched by a wallet answer')
  assert(after.seekerAnswers === before.seekerAnswers, 'seeker answer count untouched by a wallet answer')
  const reward = await tokenBalance(wallet.address, openPoll.rewardMint, tokenProgram)
  assert(reward === openPoll.rewardPerAnswer, `wallet reward balance ${reward} == reward_per_answer ${openPoll.rewardPerAnswer}`)
  const answerData = await fetchData(answerAddress(openPoll.address, wallet.address))
  assert(answerData, 'Answer account exists at ["answer", poll, wallet]')
  const rec = decodeAnswer(answerAddress(openPoll.address, wallet.address), answerData)
  assert(rec.tier === TIER_WALLET && rec.identity === wallet.address && rec.choice === CHOICE, 'Answer account stores tier 0, wallet identity, choice')
  console.log(
    `PASS open poll: answers ${before.answers}->${after.answers}, tallies ${JSON.stringify(before.tallies)}->${JSON.stringify(after.tallies)}, ` +
      `seekerTallies ${JSON.stringify(after.seekerTallies)} unchanged, reward ${reward} == ${openPoll.rewardPerAnswer}, Answer{tier ${rec.tier}}`,
  )

  // 4. same wallet, seekers-only poll: must fail on chain with SeekersOnly
  const sBefore = seekersPoll
  let failure = ''
  try {
    await sendAndConfirm(wallet, ixs(seekersPoll, 0), { skipPreflight: true })
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }
  assert(failure, 'seekers-only answer from a tier 0 wallet was rejected')
  assert(new RegExp(`"Custom":"?${SEEKERS_ONLY_ERROR}"?`).test(failure), `rejected with Custom ${SEEKERS_ONLY_ERROR} (SeekersOnly), got: ${failure}`)
  const sAfter = (await listPolls()).find((p) => p.address === seekersPoll.address)
  assert(sAfter, 'seekers-only poll still readable')
  assert(sAfter.answers === sBefore.answers && same(sAfter.tallies, sBefore.tallies), 'seekers-only poll tally unchanged')
  assert((await fetchData(answerAddress(seekersPoll.address, wallet.address))) === null, 'no Answer account was created')
  console.log(`PASS seekers-only poll: on-chain failure ${failure.replace(/^transaction \S+ failed: /, '')}`)
  console.log(`     app message: "${describeSimulationError({ InstructionError: [1, { Custom: SEEKERS_ONLY_ERROR }] }, 1)}"`)
} finally {
  // 5. return what is left to the funder so the run costs only fees and rent
  const left = await lamports(wallet.address)
  const FEE = 5000n
  await sendAndConfirm(wallet, [transfer(wallet.address, funder.address, left - FEE)])
  console.log(`swept ${left - FEE} lamports back to ${funder.address}, wallet left with ${await lamports(wallet.address)}`)
}
console.log('OK')
