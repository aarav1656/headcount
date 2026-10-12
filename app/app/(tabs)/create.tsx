import { useState } from 'react'
import { Pressable, TextInput, View, type TextInputProps } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/empty'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { color, font, radius, space } from '@/constants/theme'
import { formatTokens, parseTokens, utf8Length } from '@/lib/format'
import { describeError } from '@/lib/headcount/errors'
import { fetchPoll, fetchTokenBalance } from '@/lib/headcount/client'
import {
  createPollInstruction,
  MAX_OPTION_BYTES,
  MAX_OPTIONS,
  MAX_QUESTION_BYTES,
  MIN_OPTIONS,
  pollAddress,
} from '@/lib/headcount/program'
import { useMint, useRefreshHeadcount, useRewardBalance } from '@/features/headcount/queries'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

const DURATIONS = [1, 3, 7, 14]
const MAX_ANSWERS_CAP = 100_000

export default function Create() {
  const router = useRouter()
  const { account, ensureAccount, sendAndConfirm, rpc } = useHeadcountWallet()
  const mint = useMint()
  const balance = useRewardBalance(account?.address)
  const refresh = useRefreshHeadcount()

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [reward, setReward] = useState('5')
  const [maxAnswers, setMaxAnswers] = useState('100')
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decimals = mint.data?.decimals ?? 6
  const rewardUnits = parseTokens(reward, decimals)
  const max = /^\d+$/.test(maxAnswers) ? Number(maxAnswers) : 0
  const total = rewardUnits !== null && max > 0 ? rewardUnits * BigInt(max) : null
  const label = ACTIVE_CLUSTER.rewardLabel

  const problem = validate()
  function validate(): string | null {
    const q = question.trim()
    if (!q) return 'Write the question first.'
    if (utf8Length(q) > MAX_QUESTION_BYTES) return `The question is over ${MAX_QUESTION_BYTES} bytes.`
    const filled = options.map((o) => o.trim())
    if (filled.some((o) => !o)) return 'Fill every option or remove the empty one.'
    if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) return 'Two options say the same thing.'
    if (filled.some((o) => utf8Length(o) > MAX_OPTION_BYTES)) return `An option is over ${MAX_OPTION_BYTES} bytes.`
    if (rewardUnits === null) return `Reward per answer must be a positive number with at most ${decimals} decimals.`
    if (max < 1 || max > MAX_ANSWERS_CAP)
      return `Answers needed must be between 1 and ${MAX_ANSWERS_CAP.toLocaleString('en-US')}.`
    return null
  }

  async function publish() {
    if (problem || total === null || rewardUnits === null || !mint.data) return
    setBusy(true)
    setError(null)
    try {
      const acct = await ensureAccount()
      const held = await fetchTokenBalance(rpc, acct.address, ACTIVE_CLUSTER.rewardMint, mint.data.tokenProgram)
      if (held < total) {
        throw new Error(
          `This wallet holds ${formatTokens(held, decimals)} ${label} and the poll needs ${formatTokens(total, decimals)}. Lower the reward or the answers needed.`,
        )
      }
      const pollId = BigInt(Date.now())
      const closesAt = BigInt(Math.floor(Date.now() / 1000) + days * 86400)
      await sendAndConfirm(acct.address, [
        createPollInstruction({
          creator: acct.address,
          pollId,
          question: question.trim(),
          options: options.map((o) => o.trim()),
          rewardPerAnswer: rewardUnits,
          maxAnswers: max,
          closesAt,
          rewardMint: ACTIVE_CLUSTER.rewardMint,
          tokenProgram: mint.data.tokenProgram,
        }),
      ])
      const address = pollAddress(acct.address, pollId)
      const created = await fetchPoll(rpc, address)
      if (!created)
        throw new Error('The transaction confirmed but the poll is not readable yet. Pull to refresh on Today.')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await refresh()
      setQuestion('')
      setOptions(['', ''])
      router.push(`/poll/${address}`)
    } catch (e) {
      const d = describeError(e)
      if (!d.cancelled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(d.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      edges={['top']}
      footer={
        <View style={{ gap: space.sm }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {problem ? <Text variant="monoSmall">{problem}</Text> : null}
          <Button
            label={total !== null ? `Fund ${formatTokens(total, decimals)} ${label} and publish` : 'Fund and publish'}
            disabled={!!problem || !mint.data}
            loading={busy}
            onPress={publish}
          />
        </View>
      }
    >
      <View style={{ gap: space.sm }}>
        <Text variant="display" style={{ fontSize: 34, lineHeight: 36 }}>
          Ask Seeker owners.
        </Text>
        <Text variant="small">
          You fund every reward up front. Each phone that answers is paid instantly, and unused rewards come back when
          you close the poll.
        </Text>
      </View>

      <Field label="Question" hint={`${utf8Length(question.trim())}/${MAX_QUESTION_BYTES} bytes`}>
        <Input
          value={question}
          onChangeText={setQuestion}
          placeholder="What do you want to know?"
          multiline
          style={{ minHeight: 76, textAlignVertical: 'top' }}
        />
      </Field>

      <View style={{ gap: space.md }}>
        <Text variant="bodyStrong">Options</Text>
        {options.map((o, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.monoSemi, width: 18, color: color.inkFaint }}>{'ABCDEF'[i]}</Text>
            <Input
              style={{ flex: 1 }}
              value={o}
              onChangeText={(t) => setOptions(options.map((x, j) => (j === i ? t : x)))}
              placeholder={`Option ${i + 1}`}
              maxLength={MAX_OPTION_BYTES}
            />
            {options.length > MIN_OPTIONS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove option ${i + 1}`}
                hitSlop={8}
                onPress={() => setOptions(options.filter((_, j) => j !== i))}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: font.bodySemi, fontSize: 22, color: color.inkSoft }}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {options.length < MAX_OPTIONS ? (
          <View style={{ alignSelf: 'flex-start', marginLeft: 18 }}>
            <Button label="Add an option" kind="ghost" onPress={() => setOptions([...options, ''])} />
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <View style={{ flex: 1 }}>
          <Field label="Reward each">
            <Input value={reward} onChangeText={setReward} keyboardType="decimal-pad" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Answers needed">
            <Input value={maxAnswers} onChangeText={setMaxAnswers} keyboardType="number-pad" />
          </Field>
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="bodyStrong">Open for</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="radio"
              accessibilityState={{ selected: days === d }}
              onPress={() => setDays(d)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: days === d ? 2.5 : 1.5,
                borderColor: days === d ? color.ink : color.rule,
                backgroundColor: days === d ? color.card : pressed ? color.paperDeep : 'transparent',
              })}
            >
              <Text style={{ fontFamily: font.monoSemi, fontSize: 14, color: color.ink }}>
                {d === 1 ? '1 day' : `${d} days`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.xs, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.rule }}>
        <Text variant="small">
          {total !== null
            ? `Each answer pays ${reward.trim()} ${label}. This locks ${formatTokens(total, decimals)} ${label} in the poll vault.`
            : 'Enter a reward and an answer count to see the total.'}
        </Text>
        <Text variant="monoSmall">
          {account
            ? `Wallet holds ${balance.data !== undefined ? formatTokens(balance.data, decimals) : '...'} ${label}. Rent for the poll accounts, about 0.007 SOL, is paid from the same wallet.`
            : 'Connect a wallet when you publish. It must hold the reward token and a little SOL.'}
        </Text>
      </View>
    </Screen>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Text variant="monoSmall">{hint}</Text> : null}
      </View>
      {children}
    </View>
  )
}

function Input({ style, ...rest }: TextInputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      placeholderTextColor={color.inkFaint}
      selectionColor={color.stamp}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        {
          minHeight: 52,
          borderRadius: radius.md,
          borderWidth: focused ? 2.5 : 1.5,
          borderColor: focused ? color.ink : color.rule,
          backgroundColor: color.card,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          fontFamily: font.body,
          fontSize: 16,
          color: color.ink,
        },
        style,
      ]}
      {...rest}
    />
  )
}
