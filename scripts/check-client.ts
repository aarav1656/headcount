// Exercises the exact read paths the app uses (app/lib/headcount/client.ts) against live devnet.
import { ACTIVE_CLUSTER } from '../app/constants/headcount'
import {
  fetchAllPolls,
  fetchAnswersByAnswerer,
  fetchMintInfo,
  fetchPollsByCreator,
  fetchTokenBalance,
} from '../app/lib/headcount/client'
import { loadSigner, rpc } from './chain'

const admin = await loadSigner()
const polls = await fetchAllPolls(rpc as never)
const mint = await fetchMintInfo(rpc as never, ACTIVE_CLUSTER.rewardMint)
const mine = await fetchPollsByCreator(rpc as never, admin.address)
const bal = await fetchTokenBalance(rpc as never, admin.address, ACTIVE_CLUSTER.rewardMint, mint.tokenProgram)
const answers = await fetchAnswersByAnswerer(rpc as never, admin.address)
console.log({
  polls: polls.length,
  creatorPolls: mine.length,
  mint,
  balanceBaseUnits: bal.toString(),
  answersByAdmin: answers.length,
})
console.log(polls.map((p) => `${p.address} ${p.question}`))
if (polls.length < 3 || mine.length < 3) throw new Error('expected the 3 seeded polls')
if (mint.decimals !== 6) throw new Error('decimals read wrong')
if (bal <= 0n) throw new Error('balance read wrong')
// negative case: a creator filter for a wallet that created nothing must return none
const other = await fetchPollsByCreator(rpc as never, ACTIVE_CLUSTER.rewardMint)
if (other.length !== 0) throw new Error('memcmp creator filter returned polls for a non-creator')
console.log('OK')
