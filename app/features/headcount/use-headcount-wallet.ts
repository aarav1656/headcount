import { useCallback } from 'react'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  type Address,
  type Instruction,
} from '@solana/kit'
import { HeadcountUserError, describeSimulationError } from '@/lib/headcount/errors'
import { waitForSignature, type HeadcountRpc } from '@/lib/headcount/client'

const b58 = getBase58Decoder()

export function useHeadcountWallet() {
  const { account, connect, disconnect, signMessages, getTransactionSigner, client } = useMobileWallet()
  const rpc = client.rpc as HeadcountRpc

  const ensureAccount = useCallback(async () => account ?? (await connect()), [account, connect])

  const signMessage = useCallback((message: Uint8Array) => signMessages(message), [signMessages])

  /**
   * Simulates first so program errors reach the user as a sentence instead of an opaque wallet
   * failure, then asks the wallet to sign and send, then waits for confirmation.
   * `answerIndex` is the instruction whose system errors should read as "already answered".
   */
  const sendAndConfirm = useCallback(
    async (payer: Address, instructions: Instruction[], answerIndex = -1): Promise<string> => {
      const {
        context: { slot },
        value: blockhash,
      } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => appendTransactionMessageInstructions(instructions, m),
        (m) => setTransactionMessageFeePayerSigner(getTransactionSigner(payer, slot), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      )
      const sim = await rpc
        .simulateTransaction(getBase64EncodedWireTransaction(compileTransaction(message)), {
          encoding: 'base64',
          sigVerify: false,
          replaceRecentBlockhash: true,
          commitment: 'confirmed',
        })
        .send()
      if (sim.value.err) throw new HeadcountUserError(describeSimulationError(sim.value.err, answerIndex))

      const signature = b58.decode(await signAndSendTransactionMessageWithSigners(message))
      await waitForSignature(rpc, signature)
      return signature
    },
    [getTransactionSigner, rpc],
  )

  return { account, connect, disconnect, ensureAccount, signMessage, sendAndConfirm, rpc }
}
