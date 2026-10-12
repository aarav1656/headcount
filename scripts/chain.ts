import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit'

export const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com'
export const rpc = createSolanaRpc(RPC_URL)

/** Reads the keypair file in place. The secret is never printed or logged. */
export async function loadSigner(
  path = process.env.KEYPAIR ?? `${homedir()}/.config/solana/id.json`,
): Promise<KeyPairSigner> {
  const bytes = Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')) as number[])
  return createKeyPairSignerFromBytes(bytes)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Sends and polls to confirmed. Throws on an on-chain error or on timeout. */
export async function sendAndConfirm(
  payer: KeyPairSigner,
  instructions: Instruction[],
  opts: { skipPreflight?: boolean } = {},
): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  )
  const signed = await signTransactionMessageWithSigners(message)
  assertIsTransactionWithBlockhashLifetime(signed)
  const signature = getSignatureFromTransaction(signed)
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: 'base64',
      preflightCommitment: 'confirmed',
      skipPreflight: opts.skipPreflight ?? false,
    })
    .send()
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send()
    const s = value[0]
    if (s?.err)
      throw new Error(
        `transaction ${signature} failed: ${JSON.stringify(s.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
      )
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return signature
    await sleep(1000)
  }
  throw new Error(`transaction ${signature} not confirmed within 60s`)
}

export async function fetchData(a: Address): Promise<Uint8Array | null> {
  const { value } = await rpc.getAccountInfo(a, { encoding: 'base64', commitment: 'confirmed' }).send()
  if (!value) return null
  return Uint8Array.from(Buffer.from(value.data[0], 'base64'))
}
