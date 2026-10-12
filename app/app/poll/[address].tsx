import { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { address as toAddress, type Address } from '@solana/kit'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Empty, Notice } from '@/components/ui/empty'
import { Results } from '@/components/results'
import { ACTIVE_CLUSTER, ATTESTOR_PUBKEY, explorerTx } from '@/constants/headcount'
import { color, font, radius, space } from '@/constants/theme'
import { formatTokens, timeLeft } from '@/lib/format'
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

  if (!pollAddress || poll.isError || (poll.isSuccess && !p)) {
    return (
      <Screen>
        <BackRow onBack={() => router.back()} />
        <Empty
          title="This poll is not on chain"
          body="The link is wrong or the poll lives on another network. Go back to Today to see the open polls."
          actionLabel="Back to Today"
          onAction={() => router.replace('/')}
        />
      </Screen>
    )
  }
  if (!p) {
    return (
      <Screen>
        <BackRow onBack={() => router.back()} />
        <ActivityIndicator color={color.stamp} />
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
  const reward = `${formatTokens(p.rewardPerAnswer, decimals)} ${ACTIVE_CLUSTER.rewardLabel}`
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

  return (
    <Screen
      refreshing={poll.isRefetching}
      onRefresh={() => {
        poll.refetch()
        mine.refetch()
      }}
      edges={['top', 'bottom']}
      footer={
        cta ? (
          <View style={{ gap: space.sm }}>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {busy ? (
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <ActivityIndicator color={color.stamp} />
                <Text variant="small" style={{ flex: 1 }}>
                  {STEP_TEXT[step as Exclude<Step, 'idle'>]}
                </Text>
              </View>
            ) : null}
            <Button label={`Answer and earn ${reward}`} disabled={choice === null} loading={busy} onPress={submit} />
            <Text variant="monoSmall">
              {choice === null ? 'Pick an option first. ' : ''}Network fee and account rent, about 0.004 SOL, come from
              your wallet.
            </Text>
          </View>
        ) : undefined
      }
    >
      <BackRow onBack={() => router.back()} />

      <View style={{ gap: space.md }}>
        <Text variant="title" style={{ fontSize: 28, lineHeight: 32 }}>
          {p.question}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 2 }}>
          <Text style={{ fontFamily: font.monoSemi, fontSize: 14, color: color.stamp }}>pays {reward}</Text>
          <Text variant="monoSmall" style={{ alignSelf: 'center', color: p.seekersOnly ? color.stamp : color.inkSoft }}>
            {p.seekersOnly ? 'Seekers only' : 'Open'}
          </Text>
          <Text variant="monoSmall" style={{ alignSelf: 'center' }}>
            {p.maxAnswers - p.answers} of {p.maxAnswers} left
          </Text>
          <Text variant="monoSmall" style={{ alignSelf: 'center' }}>
            {ended ? 'ended' : `closes in ${timeLeft(p.closesAt)}`}
          </Text>
        </View>
      </View>

      {reveal ? (
        <View style={{ gap: space.lg }}>
          {justAnswered ? (
            <View style={{ gap: space.xs }}>
              <Text variant="bodyStrong" style={{ color: color.success }}>
                Counted. {reward} sent to your wallet.
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(explorerTx(justAnswered.signature))}
                hitSlop={8}
              >
                <Text variant="monoSmall" style={{ textDecorationLine: 'underline' }}>
                  View transaction
                </Text>
              </Pressable>
            </View>
          ) : alreadyAnswered ? (
            <Notice tone="warn">
              {`This ${p.seekersOnly ? 'Seeker phone' : 'phone or wallet'} already answered this poll, so its answer is counted. Results are open.`}
            </Notice>
          ) : isCreator && yourChoice === undefined ? (
            <Text variant="small">You created this poll, so the tally is open to you.</Text>
          ) : (
            <Text variant="small">You answered. Results are open.</Text>
          )}
          <Results poll={p} yourChoice={yourChoice} />
          {canClose ? (
            <View style={{ gap: space.sm }}>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button
                label="Close poll and return unused rewards"
                kind="secondary"
                loading={busy}
                onPress={closePoll}
              />
            </View>
          ) : null}
        </View>
      ) : ended || full ? (
        <Empty
          title={full ? 'All answers are in' : 'This poll has ended'}
          body="Answer open polls on Today to earn. Results stay private to people who answered and to the creator."
          actionLabel="See open polls"
          onAction={() => router.replace('/')}
        />
      ) : (
        <View style={{ gap: space.md }}>
          {p.options.map((label, i) => (
            <OptionRow
              key={i}
              index={i}
              label={label}
              selected={choice === i}
              disabled={busy}
              onPress={() => setChoice(i)}
            />
          ))}
          <Text variant="small">Results unlock after you answer.</Text>
        </View>
      )}
    </Screen>
  )
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onBack}
      hitSlop={12}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <Text style={{ fontFamily: font.bodySemi, fontSize: 16, color: color.ink }}>Back</Text>
    </Pressable>
  )
}

function OptionRow({
  index,
  label,
  selected,
  disabled,
  onPress,
}: {
  index: number
  label: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.lg,
        paddingHorizontal: space.lg,
        borderRadius: radius.md,
        borderWidth: selected ? 2.5 : 1.5,
        borderColor: selected ? color.ink : color.rule,
        backgroundColor: selected ? color.card : pressed ? color.paperDeep : 'transparent',
        opacity: disabled && !selected ? 0.5 : 1,
      })}
    >
      <Text
        style={{ fontFamily: font.monoSemi, fontSize: 16, color: selected ? color.stamp : color.inkFaint, width: 18 }}
      >
        {'ABCDEF'[index]}
      </Text>
      <Text variant="bodyStrong" style={{ flex: 1, fontSize: 17 }}>
        {label}
      </Text>
    </Pressable>
  )
}
