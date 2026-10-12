import { type Address } from '@solana/kit'
import {
  ACCOUNT,
  ataAddress,
  createPollInstruction,
  decodePoll,
  discriminatorBase58,
  pollAddress,
  vaultAddress,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  type Poll,
} from '../app/lib/headcount/program'
import { ACTIVE_CLUSTER, PROGRAM_ID } from '../app/constants/headcount'
import { fetchData, loadSigner, rpc, sendAndConfirm } from './chain'

const REWARD_TOKENS = 5n
const MAX_ANSWERS = 200
const DAYS = 7

const POLLS: { question: string; options: string[]; seekersOnly: boolean }[] = [
  {
    question: 'Where do you install most of the apps on your Seeker?',
    options: ['Solana dApp Store', 'Google Play', 'Sideloaded APKs', 'I mostly use the mobile web'],
    seekersOnly: true,
  },
  {
    question: 'You just received SKR. What do you do with it first?',
    options: ['Stake it', 'Hold it', 'Spend it in apps', 'Trade it for another token'],
    seekersOnly: false,
  },
  {
    question: 'Which app do you open on your Seeker every single day?',
    options: ['A wallet', 'X or Telegram', 'A trading app', 'A game', 'A browser', 'Something else'],
    seekersOnly: false,
  },
]

const signer = await loadSigner()
const mint = ACTIVE_CLUSTER.rewardMint

const mintAcct = await rpc.getAccountInfo(mint, { encoding: 'jsonParsed', commitment: 'confirmed' }).send()
if (!mintAcct.value) throw new Error(`reward mint ${mint} not found on ${ACTIVE_CLUSTER.key}`)
const tokenProgram = mintAcct.value.owner as Address
if (tokenProgram !== TOKEN_PROGRAM && tokenProgram !== TOKEN_2022_PROGRAM)
  throw new Error(`mint owner ${tokenProgram} is not a token program`)
const decimals = (mintAcct.value.data as { parsed: { info: { decimals: number } } }).parsed.info.decimals
const reward = REWARD_TOKENS * 10n ** BigInt(decimals)
const creatorToken = ataAddress(signer.address, mint, tokenProgram)
const bal = await rpc.getTokenAccountBalance(creatorToken, { commitment: 'confirmed' }).send()
console.log(`creator ${signer.address}`)
console.log(`mint ${mint} (${ACTIVE_CLUSTER.rewardLabel}) program ${tokenProgram} decimals ${decimals}`)
console.log(`creator token balance ${bal.value.uiAmountString}`)

const listPolls = async (): Promise<Poll[]> => {
  const accts = await rpc
    .getProgramAccounts(PROGRAM_ID, {
      encoding: 'base64',
      commitment: 'confirmed',
      filters: [{ memcmp: { offset: 0n, bytes: discriminatorBase58(ACCOUNT.poll) as never, encoding: 'base58' } }],
    })
    .send()
  return accts.map((a) => decodePoll(a.pubkey, Uint8Array.from(Buffer.from(a.account.data[0], 'base64'))))
}

const existing = await listPolls()
const created: Address[] = []
const base = BigInt(Date.now())
for (const [i, p] of POLLS.entries()) {
  const dupe = existing.find((e) => e.creator === signer.address && e.question === p.question)
  if (dupe) {
    console.log(`skip (already on chain): ${p.question} -> ${dupe.address}`)
    created.push(dupe.address)
    continue
  }
  const pollId = base + BigInt(i)
  const closesAt = BigInt(Math.floor(Date.now() / 1000) + DAYS * 86400)
  const sig = await sendAndConfirm(signer, [
    createPollInstruction({
      creator: signer.address,
      pollId,
      question: p.question,
      options: p.options,
      rewardPerAnswer: reward,
      maxAnswers: MAX_ANSWERS,
      closesAt,
      seekersOnly: p.seekersOnly,
      rewardMint: mint,
      tokenProgram,
    }),
  ])
  const addr = pollAddress(signer.address, pollId)
  created.push(addr)
  console.log(`create_poll ${addr}\n  signature ${sig}`)
}

console.log('\nReading Poll accounts back from the chain:')
const all = await listPolls()
let proven = 0
for (const addr of created) {
  const p = all.find((x) => x.address === addr)
  if (!p) throw new Error(`poll ${addr} missing from getProgramAccounts`)
  const vault = await rpc.getTokenAccountBalance(vaultAddress(addr), { commitment: 'confirmed' }).send()
  console.log(
    JSON.stringify(
      {
        address: p.address,
        creator: p.creator,
        pollId: p.pollId.toString(),
        rewardMint: p.rewardMint,
        rewardPerAnswer: p.rewardPerAnswer.toString(),
        maxAnswers: p.maxAnswers,
        answers: p.answers,
        closesAt: new Date(Number(p.closesAt) * 1000).toISOString(),
        question: p.question,
        options: p.options,
        tallies: p.tallies,
        seekersOnly: p.seekersOnly,
        seekerTallies: p.seekerTallies,
        seekerAnswers: p.seekerAnswers,
        closed: p.closed,
        vaultBalance: vault.value.uiAmountString,
      },
      null,
      2,
    ),
  )
  const want = POLLS.find((x) => x.question === p.question)
  if (!want || p.seekersOnly !== want.seekersOnly) throw new Error(`poll ${addr} has the wrong seekersOnly flag`)
  if (p.rewardPerAnswer !== reward || p.maxAnswers !== MAX_ANSWERS || p.closed)
    throw new Error(`poll ${addr} has unexpected parameters`)
  if (BigInt(vault.value.amount) !== reward * BigInt(MAX_ANSWERS))
    throw new Error(`vault for ${addr} is not fully funded`)
  proven++
}
if (proven !== POLLS.length) throw new Error('not every seeded poll was proven')
const open = POLLS.filter((x) => !x.seekersOnly).length
console.log(`\nOK: ${proven} polls exist (${open} open, ${proven - open} seekers-only), funded ${REWARD_TOKENS * BigInt(MAX_ANSWERS)} tokens each`)
