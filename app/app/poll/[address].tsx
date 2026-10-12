import { useMemo, useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { address as toAddress, type Address } from '@solana/kit'
import { Screen, BleedRule } from '@/components/ui/screen'
import { Text, questionVariant } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Problem, Stamp } from '@/components/ui/stamp'
import { TallyProgress } from '@/components/ui/tally'
import { BallotRow } from '@/components/ballot-row'
import { PollMeta } from '@/components/poll-meta'
import { Receipt } from '@/components/receipt'
import { Results } from '@/components/results'
import { ACTIVE_CLUSTER, ATTESTOR_PUBKEY } from '@/constants/headcount'
import { color, space } from '@/constants/theme'
import { UNIT, money } from '@/utils/skr'
import { formatTokens } from '@/lib/format'
import { fetchAnswerForPoll } from '@/lib/headcount/client'
import { ALREADY_ANSWERED_MESSAGE, HeadcountUserError, describeError } from '@/lib/headcount/errors'
import {
  answerInstruction,
  attestationMessage,
  closePollInstruction,
  ed25519Instruction,
  TIER_SEEKER,
} from '@/lib/headcount/program'
import { forgetSession, getAttestation } from '@/lib/headcount/session'
import { useMint, useMyAnswerForPoll, usePoll, useRefreshHeadcount } from '@/features/headcount/queries'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

type Step = 'idle' | 'connect' | 'sign' | 'check' | 'wallet'

const STEP_TEXT: Record<Exclude<Step, 'idle'>, string> = {
  connect: 'Connecting your wallet',
  sign: 'Sign in with your wallet. This happens once per session.',
  check: 'Checking your wallet',
  wallet: 'Approve the transaction in your wallet. We confirm it on chain after.',
}

export default function PollScreen() {
  const { address } = useLocalSearchParams<{ address: string }>()
  const router = useRouter()
  const pollAddress = useMemo(() => {
    try {
      return toAddress(address)
    } catch {
      return undefined
    }
  }, [address])

  const { account, ensureAccount, signMessage, sendAndConfirm, rpc } = useHeadcountWallet()
  const poll = usePoll(pollAddress)
  const mint = useMint()
  const mine = useMyAnswerForPoll(pollAddress, account?.address)
  const refresh = useRefreshHeadcount()

  const [choice, setChoice] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [justAnswered, setJustAnswered] = useState<{ choice: number; signature: string } | null>(null)
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)

  const p = poll.data
  const decimals = mint.data?.decimals ?? 6
  const busy = step !== 'idle'

  const back = { label: 'Today', onPress: () => router.back() }

  if (!pollAddress || poll.isError || (poll.isSuccess && !p)) {
    return (
      <Screen back={back}>
        <View style={{ gap: space.lg }}>
          <Text variant="question">This ballot is not on chain.</Text>
          <Text variant="body" style={{ color: color.ink2 }}>
            The link is wrong, or the ballot lives on another network. Go back to Today to see what is open.
          </Text>
          <Button label="Back to Today" kind="outline" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    )
  }
  if (!p) {
    return (
      <Screen back={back}>
        <View style={{ gap: space.md, paddingVertical: space.xl }}>
          <TallyProgress height={22} />
          <Text variant="label" style={{ color: color.ink2 }}>
            Pulling the ballot from {ACTIVE_CLUSTER.key}
          </Text>
        </View>
      </Screen>
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const ended = p.closed || Number(p.closesAt) <= now
  const full = p.answers >= p.maxAnswers
  const isCreator = !!account && account.address === p.creator
  const yourChoice = justAnswered?.choice ?? mine.data?.choice
  const hasAnswered = yourChoice !== undefined || alreadyAnswered
  const reveal = hasAnswered || isCreator
  const rewardShort = `${formatTokens(p.rewardPerAnswer, decimals)} ${UNIT}`
  const rewardFull = `${money(p.rewardPerAnswer, decimals)} ${UNIT}`
  const canClose = isCreator && !p.closed && (Number(p.closesAt) <= now || full)

  async function submit() {
    if (choice === null || !p) return
    setError(null)
    setStep('connect')
    let wallet: Address | undefined
    try {
      const acct = await ensureAccount()
      wallet = acct.address
      const att = await getAttestation(wallet, signMessage, (s) => setStep(s === 'signing' ? 'sign' : 'check'))
      if (p.seekersOnly && att.tier !== TIER_SEEKER) {
        router.push({ pathname: '/no-sgt', params: { wallet } })
        return
      }
      setStep('wallet')
      const info = mint.data
      if (!info) throw new Error('The reward mint could not be read. Pull to refresh and try again.')
      const message = attestationMessage(wallet, att.identity, att.tier, att.expiresAt)
      const signature = await sendAndConfirm(
        wallet,
        [
          ed25519Instruction({ signature: att.signature, publicKey: ATTESTOR_PUBKEY, message }),
          answerInstruction({
            answerer: wallet,
            poll: p,
            choice,
            identity: att.identity,
            tier: att.tier,
            expiresAt: att.expiresAt,
            tokenProgram: info.tokenProgram,
          }),
        ],
        1,
      )
      // Completion proof: the Answer account for this wallet must now exist on chain.
      const recorded = await fetchAnswerForPoll(rpc, p.address, wallet)
      if (!recorded)
        throw new Error('The transaction confirmed but the answer is not readable yet. Pull to refresh in a moment.')
      setJustAnswered({ choice: recorded.choice, signature })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await refresh()
    } catch (e) {
      if (e instanceof HeadcountUserError && wallet) forgetSession(wallet)
      const d = describeError(e)
      if (d.message === ALREADY_ANSWERED_MESSAGE) setAlreadyAnswered(true)
      if (!d.cancelled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(d.message)
    } finally {
      setStep('idle')
    }
  }

  async function closePoll() {
    if (!account || !p || !mint.data) return
    setError(null)
    setStep('wallet')
    try {
      await sendAndConfirm(account.address, [
        closePollInstruction({ creator: account.address, poll: p, tokenProgram: mint.data.tokenProgram }),
      ])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await refresh()
    } catch (e) {
      const d = describeError(e)
      if (!d.cancelled) setError(d.message)
    } finally {
      setStep('idle')
    }
  }

  const cta = !reveal && !ended && !full
  const yourLabel = yourChoice !== undefined ? p.options[yourChoice] : undefined

  return (
    <Screen
      back={back}
      refreshing={poll.isRefetching}
      onRefresh={() => {
        poll.refetch()
        mine.refetch()
      }}
      edges={['top', 'bottom']}
      footer={
        cta ? (
          <>
            {error ? <Problem>{error}</Problem> : null}
            {busy ? (
              <Text variant="fine">{STEP_TEXT[step as Exclude<Step, 'idle'>]}</Text>
            ) : (
              <Text variant="fine">
                {choice === null ? 'Mark one option to cast.' : 'Costs about 0.004 SOL in fee and rent.'}
              </Text>
            )}
            <Button
              label={`Cast answer · +${rewardShort}`}
              disabled={choice === null}
              loading={busy}
              onPress={submit}
            />
          </>
        ) : undefined
      }
    >
      <View style={{ gap: space.md }}>
        {p.seekersOnly ? <Stamp label="Seeker phones only" /> : null}
        <Text variant={questionVariant(p.question)} accessibilityRole="header">
          {p.question}
        </Text>
        <PollMeta poll={p} decimals={decimals} ended={ended} hideSeekers />
      </View>

      {reveal ? (
        <View style={{ gap: space.xl }}>
          {justAnswered ? (
            <Receipt
              question={p.question}
              choice={p.options[justAnswered.choice] ?? ''}
              reward={rewardFull}
              signature={justAnswered.signature}
            />
          ) : alreadyAnswered ? (
            <Problem>{`This ${p.seekersOnly ? 'Seeker phone' : 'phone or wallet'} already answered this ballot, so its answer is counted. Results are open.`}</Problem>
          ) : isCreator && yourChoice === undefined ? (
            <Text variant="body" style={{ color: color.ink2 }}>
              You drafted this ballot, so the tally is open to you.
            </Text>
          ) : (
            <Text variant="body" style={{ color: color.ink2 }}>
              {yourLabel ? `You marked ${yourLabel}. Results are open.` : 'You answered. Results are open.'}
            </Text>
          )}
          <Results poll={p} yourChoice={yourChoice} />
          {canClose ? (
            <View style={{ gap: space.md }}>
              {error ? <Problem>{error}</Problem> : null}
              <Button label="Close ballot, return unused" kind="outline" loading={busy} onPress={closePoll} />
            </View>
          ) : null}
        </View>
      ) : ended || full ? (
        <View style={{ gap: space.lg }}>
          <Text variant="questionLong">{full ? 'All answers are in.' : 'This ballot has closed.'}</Text>
          <Text variant="body" style={{ color: color.ink2 }}>
            Results stay with the people who answered and the one who drafted it. Answer an open ballot to earn.
          </Text>
          <Button label="See open polls" kind="outline" onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View>
          <BleedRule />
          <View style={{ marginHorizontal: -space.lg }} accessibilityRole="radiogroup">
            {p.options.map((label, i) => (
              <BallotRow key={i} label={label} selected={choice === i} disabled={busy} onPress={() => setChoice(i)} />
            ))}
          </View>
          <Text variant="fine" style={{ marginTop: space.md }}>
            Results unlock after you answer.
          </Text>
        </View>
      )}
    </Screen>
  )
}
