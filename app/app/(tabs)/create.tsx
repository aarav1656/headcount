import { useState } from 'react'
import { Pressable, TextInput, View, type TextInputProps } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Problem } from '@/components/ui/stamp'
import { Cross } from '@/components/ui/glyphs'
import { TallyBox } from '@/components/ui/ink-check'
import { useFocus } from '@/components/ui/focus'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { UNIT, money } from '@/utils/skr'
import { border, color, space, text } from '@/constants/theme'
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
const NUMBERS = ['01', '02', '03', '04', '05', '06']
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
  const [seekersOnly, setSeekersOnly] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decimals = mint.data?.decimals ?? 6
  const rewardUnits = parseTokens(reward, decimals)
  const max = /^\d+$/.test(maxAnswers) ? Number(maxAnswers) : 0
  const total = rewardUnits !== null && max > 0 ? rewardUnits * BigInt(max) : null

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
          `This wallet holds ${formatTokens(held, decimals)} ${UNIT} and the poll needs ${formatTokens(total, decimals)}. Lower the reward or the answers needed.`,
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
          seekersOnly,
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

  const wallet = account
    ? `Wallet holds ${balance.data !== undefined ? money(balance.data, decimals) : '...'} ${UNIT}. Rent for the ballot accounts, about 0.007 SOL, is paid from the same wallet.`
    : 'Connect a wallet when you publish. It must hold the reward token and a little SOL.'

  return (
    <Screen
      edges={['top']}
      footer={
        <>
          {error ? <Problem>{error}</Problem> : null}
          {problem ? <Text variant="fine">{problem}</Text> : null}
          <Button
            label={total !== null ? `Fund ${formatTokens(total, decimals)} ${UNIT} · publish` : 'Fund and publish'}
            disabled={!!problem || !mint.data}
            loading={busy}
            onPress={publish}
          />
        </>
      }
    >
      <View style={{ gap: space.md }}>
        <Text variant="question" accessibilityRole="header">
          Draft a ballot
        </Text>
        <Text variant="body" style={{ color: color.ink2 }}>
          You fund every reward up front. Each answer is paid instantly, and unused rewards come back when you close the
          ballot.
        </Text>
      </View>

      <Field label="Question" hint={`${utf8Length(question.trim())}/${MAX_QUESTION_BYTES} bytes`}>
        <Ruled
          variant="questionLong"
          value={question}
          onChangeText={setQuestion}
          placeholder="What do you want to know?"
          multiline
          accessibilityLabel="Question"
          style={{ minHeight: 76, textAlignVertical: 'top' }}
        />
      </Field>

      <View style={{ gap: space.xs }}>
        <Text variant="label">Options</Text>
        {options.map((o, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Text variant="label" style={{ color: color.ink3, width: 22 }}>
              {NUMBERS[i]}
            </Text>
            <Ruled
              variant="option"
              style={{ flex: 1 }}
              value={o}
              onChangeText={(t) => setOptions(options.map((x, j) => (j === i ? t : x)))}
              placeholder={`Option ${i + 1}`}
              accessibilityLabel={`Option ${i + 1}`}
              maxLength={MAX_OPTION_BYTES}
            />
            {options.length > MIN_OPTIONS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove option ${i + 1}`}
                onPress={() => setOptions(options.filter((_, j) => j !== i))}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? color.paper2 : 'transparent',
                })}
              >
                <Cross />
              </Pressable>
            ) : null}
          </View>
        ))}
        {options.length < MAX_OPTIONS ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label="Add an option" kind="link" onPress={() => setOptions([...options, ''])} />
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <View style={{ flex: 1 }}>
          <Field label={`Reward each, ${UNIT}`}>
            <Ruled
              variant="value"
              value={reward}
              onChangeText={setReward}
              keyboardType="decimal-pad"
              accessibilityLabel="Reward each"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Answers needed">
            <Ruled
              variant="value"
              value={maxAnswers}
              onChangeText={setMaxAnswers}
              keyboardType="number-pad"
              accessibilityLabel="Answers needed"
            />
          </Field>
        </View>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: seekersOnly }}
        onPress={() => setSeekersOnly(!seekersOnly)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: space.lg,
          alignItems: 'flex-start',
          paddingVertical: space.md,
          marginHorizontal: -space.lg,
          paddingHorizontal: space.lg,
          backgroundColor: pressed ? color.paper2 : 'transparent',
        })}
      >
        <TallyBox checked={seekersOnly} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="label">Seeker phones only</Text>
          <Text variant="fine">
            {seekersOnly
              ? 'Only Seeker phones can answer, one vote per device.'
              : 'Any wallet can answer. Results print Seeker phones beside all answers.'}
          </Text>
        </View>
      </Pressable>

      <View style={{ gap: space.sm }}>
        <Text variant="label">Open for</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="radio"
              accessibilityLabel={d === 1 ? '1 day' : `${d} days`}
              accessibilityState={{ selected: days === d }}
              onPress={() => setDays(d)}
              style={({ pressed }) => ({
                minHeight: 44,
                minWidth: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                backgroundColor: pressed ? color.paper2 : 'transparent',
              })}
            >
              <TallyBox checked={days === d} />
              <Text variant="label">{d}D</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm, borderTopWidth: border.heavy, borderTopColor: color.rule, paddingTop: space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="label">Total</Text>
          <Text
            variant="value"
            accessibilityLabel={total !== null ? `Total ${money(total, decimals)} ${UNIT}` : 'Total not set'}
          >
            {total !== null ? `${money(total, decimals)} ${UNIT}` : `0.00 ${UNIT}`}
          </Text>
        </View>
        <Text variant="fine">
          {total !== null
            ? `Each answer pays ${money(rewardUnits ?? 0n, decimals)} ${UNIT}. This locks ${money(total, decimals)} ${UNIT} in the ballot vault.`
            : 'Enter a reward and an answer count to see the total.'}
        </Text>
        <Text variant="fine">{wallet}</Text>
      </View>
    </Screen>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="label" style={{ color: color.ink3 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

/** A line to write on: text sits on a 1px ink rule. Focus is a 2px tally outline, instantly. */
function Ruled({ variant, style, ...rest }: TextInputProps & { variant: 'questionLong' | 'option' | 'value' }) {
  const { bind, ring } = useFocus(2)
  return (
    <TextInput
      placeholderTextColor={color.ink3}
      selectionColor={color.tally}
      {...bind}
      style={[
        text[variant],
        {
          minHeight: 48,
          paddingVertical: space.sm,
          paddingHorizontal: 0,
          borderBottomWidth: border.hair,
          borderBottomColor: color.rule,
        },
        ring,
        style,
      ]}
      {...rest}
    />
  )
}
