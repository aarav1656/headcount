// Sends FUND_LAMPORTS of devnet SOL from the CI funder to a wallet and reads the balance back.
// usage: CI_FUNDER_KEYPAIR='[...]' node fund.mjs <address>
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  AccountRole,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  getSignatureFromTransaction,
  signTransactionMessageWithSigners,
} from '@solana/kit'

const RPC = process.env.DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
const FUND_LAMPORTS = 50_000_000n
const SYSTEM_PROGRAM = address('11111111111111111111111111111111')

const target = process.argv[2]
if (!target) throw new Error('usage: node fund.mjs <address>')
const to = address(target)
const raw = process.env.CI_FUNDER_KEYPAIR
if (!raw) throw new Error('CI_FUNDER_KEYPAIR is not set')

const rpc = createSolanaRpc(RPC)
const funder = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(raw)))
const balance = async (a) => (await rpc.getBalance(a, { commitment: 'confirmed' }).send()).value

const funderBefore = await balance(funder.address)
console.log(`funder ${funder.address} balance ${funderBefore} lamports`)
if (funderBefore < FUND_LAMPORTS + 10_000n) throw new Error('funder balance too low')

const data = new Uint8Array(12)
const dv = new DataView(data.buffer)
dv.setUint32(0, 2, true)
dv.setBigUint64(4, FUND_LAMPORTS, true)

const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(funder, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
  (m) =>
    appendTransactionMessageInstruction(
      {
        programAddress: SYSTEM_PROGRAM,
        accounts: [
          { address: funder.address, role: AccountRole.WRITABLE_SIGNER },
          { address: to, role: AccountRole.WRITABLE },
        ],
        data,
      },
      m,
    ),
)
const signed = await signTransactionMessageWithSigners(message)
await rpc
  .sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64', preflightCommitment: 'confirmed' })
  .send()

console.log(`sent ${getSignatureFromTransaction(signed)}`)

// Completion proof: the recipient balance must read back at or above the amount sent.
const deadline = Date.now() + 60_000
for (;;) {
  const now = await balance(to)
  if (now >= FUND_LAMPORTS) {
    console.log(`funded ${to} balance ${now} lamports`)
    break
  }
  if (Date.now() > deadline) throw new Error(`funding not visible on chain after 60s for ${to}`)
  await new Promise((r) => setTimeout(r, 1500))
}
