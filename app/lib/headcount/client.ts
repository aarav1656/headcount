import { type Address, type Base58EncodedBytes, type Rpc, type Signature, type SolanaRpcApi } from '@solana/kit'
import { PROGRAM_ID } from '@/constants/headcount'
import {
  ACCOUNT,
  ANSWER_ANSWERER_OFFSET,
  ANSWER_POLL_OFFSET,
  ataAddress,
  decodeAnswer,
  decodePoll,
  discriminatorBase58,
  POLL_CREATOR_OFFSET,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  type Answer,
  type Poll,
} from './program'

export type HeadcountRpc = Rpc<SolanaRpcApi>

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const memcmp = (offset: bigint, bytes: string) => ({
  memcmp: { offset, bytes: bytes as Base58EncodedBytes, encoding: 'base58' as const },
})

async function programAccounts(rpc: HeadcountRpc, filters: ReturnType<typeof memcmp>[]) {
  const res = await rpc.getProgramAccounts(PROGRAM_ID, { encoding: 'base64', commitment: 'confirmed', filters }).send()
  return res.map((r) => ({ address: r.pubkey, data: fromBase64(r.account.data[0]) }))
}

export async function fetchAllPolls(rpc: HeadcountRpc): Promise<Poll[]> {
  const rows = await programAccounts(rpc, [memcmp(0n, discriminatorBase58(ACCOUNT.poll))])
  return rows.map((r) => decodePoll(r.address, r.data)).sort((a, b) => (a.pollId < b.pollId ? 1 : -1))
}

export async function fetchPoll(rpc: HeadcountRpc, address: Address): Promise<Poll | null> {
  const { value } = await rpc.getAccountInfo(address, { encoding: 'base64', commitment: 'confirmed' }).send()
  if (!value) return null
  return decodePoll(address, fromBase64(value.data[0]))
}

export async function fetchPollsByCreator(rpc: HeadcountRpc, creator: Address): Promise<Poll[]> {
  const rows = await programAccounts(rpc, [
    memcmp(0n, discriminatorBase58(ACCOUNT.poll)),
    memcmp(POLL_CREATOR_OFFSET, creator),
  ])
  return rows.map((r) => decodePoll(r.address, r.data)).sort((a, b) => (a.pollId < b.pollId ? 1 : -1))
}

export async function fetchAnswersByAnswerer(rpc: HeadcountRpc, answerer: Address): Promise<Answer[]> {
  const rows = await programAccounts(rpc, [
    memcmp(0n, discriminatorBase58(ACCOUNT.answer)),
    memcmp(ANSWER_ANSWERER_OFFSET, answerer),
  ])
  return rows.map((r) => decodeAnswer(r.address, r.data)).sort((a, b) => (a.answeredAt < b.answeredAt ? 1 : -1))
}

export async function fetchAnswerForPoll(rpc: HeadcountRpc, poll: Address, answerer: Address): Promise<Answer | null> {
  const rows = await programAccounts(rpc, [
    memcmp(0n, discriminatorBase58(ACCOUNT.answer)),
    memcmp(ANSWER_POLL_OFFSET, poll),
    memcmp(ANSWER_ANSWERER_OFFSET, answerer),
  ])
  return rows.length ? decodeAnswer(rows[0].address, rows[0].data) : null
}

export async function accountExists(rpc: HeadcountRpc, address: Address): Promise<boolean> {
  const { value } = await rpc.getAccountInfo(address, { encoding: 'base64', commitment: 'confirmed' }).send()
  return value !== null
}

export async function fetchPollsByAddress(rpc: HeadcountRpc, addresses: Address[]): Promise<Poll[]> {
  const unique = [...new Set(addresses)]
  const out: Poll[] = []
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { value } = await rpc.getMultipleAccounts(chunk, { encoding: 'base64', commitment: 'confirmed' }).send()
    value.forEach((acct, j) => {
      if (acct) out.push(decodePoll(chunk[j], fromBase64(acct.data[0])))
    })
  }
  return out
}

export type MintInfo = { tokenProgram: Address; decimals: number }

export async function fetchMintInfo(rpc: HeadcountRpc, mint: Address): Promise<MintInfo> {
  const { value } = await rpc.getAccountInfo(mint, { encoding: 'base64', commitment: 'confirmed' }).send()
  if (!value) throw new Error(`reward mint ${mint} does not exist on this cluster`)
  const owner = value.owner
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM)
    throw new Error(`mint ${mint} is not owned by a token program`)
  const data = fromBase64(value.data[0])
  // SPL Mint layout: mint_authority COption<Pubkey> (36), supply u64 (8), decimals u8 at byte 44.
  return { tokenProgram: owner, decimals: data[44] }
}

/** Token balance of the owner's associated token account, 0 when the account does not exist yet. */
export async function fetchTokenBalance(
  rpc: HeadcountRpc,
  owner: Address,
  mint: Address,
  tokenProgram: Address,
): Promise<bigint> {
  const ata = ataAddress(owner, mint, tokenProgram)
  const { value } = await rpc.getAccountInfo(ata, { encoding: 'base64', commitment: 'confirmed' }).send()
  if (!value) return 0n
  const data = fromBase64(value.data[0])
  // SPL Token account layout: mint (32), owner (32), amount u64 LE at byte 64.
  return new DataView(data.buffer, data.byteOffset).getBigUint64(64, true)
}

export async function waitForSignature(
  rpc: HeadcountRpc,
  signature: Signature | string,
  timeoutMs = 60_000,
): Promise<void> {
  const sig = signature as Signature
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { value } = await rpc.getSignatureStatuses([sig]).send()
    const s = value[0]
    if (s?.err)
      throw new Error(
        `Transaction failed on chain: ${JSON.stringify(s.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
      )
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return
    await new Promise((r) => setTimeout(r, 1200))
  }
  throw new Error('The transaction was sent but has not confirmed yet. Check your wallet activity before retrying.')
}
