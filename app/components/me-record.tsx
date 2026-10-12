import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Address } from '@solana/kit'
import { Screen, BleedRule } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { DashRule } from '@/components/ui/glyphs'
import { TallyCount, TallyProgress } from '@/components/ui/tally'
import { useFocus } from '@/components/ui/focus'
import { UNIT, money } from '@/utils/skr'
import { color, space } from '@/constants/theme'
import { answerDays, currentStreak, timeLeft } from '@/lib/format'
import { useMint, useMyAnswers, useMyPolls } from '@/features/headcount/queries'

const shortDate = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The record itself: read from chain for one wallet address. */
export function MeRecord({ address }: { address: Address }) {
  const router = useRouter()
  const mint = useMint()
  const answers = useMyAnswers(address)
  const created = useMyPolls(address)
  const decimals = mint.data?.decimals ?? 6

  const stats = useMemo(() => {
    const list = answers.data?.answers ?? []
    const earned = list.reduce((n, a) => n + (answers.data?.polls.get(a.poll)?.rewardPerAnswer ?? 0n), 0n)
    const days = answerDays(list.map((a) => a.answeredAt))
    return { earned, count: list.length, streak: currentStreak(days) }
  }, [answers.data])

  const answered = answers.data?.answers ?? []
  const drafted = created.data ?? []

  return (
    <Screen
      wallet
      refreshing={answers.isRefetching || created.isRefetching}
      onRefresh={() => {
        answers.refetch()
        created.refetch()
      }}
    >
      <View style={{ gap: space.md }}>
        <Text variant="label">Your record</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.lg }}>
          {answers.isLoading ? (
            <TallyProgress height={40} />
          ) : (
            <Text variant="bigNumber" accessibilityLabel={`${stats.count} ballots answered`}>
              {stats.count}
            </Text>
          )}
          <Text variant="label" style={{ color: color.ink2, flex: 1 }}>
            {stats.count === 1 ? 'Ballot answered' : 'Ballots answered'}
          </Text>
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <Row label="Earned">
          <Text variant="value" style={{ color: color.ok }}>
            +{money(stats.earned, decimals)} {UNIT}
          </Text>
        </Row>
        <View style={{ gap: space.sm }}>
          <Text variant="label" style={{ color: color.ink2 }}>
            Streak · {stats.streak} {stats.streak === 1 ? 'day' : 'days'}
          </Text>
          <TallyCount value={stats.streak} height={32} tint={color.tally} ghost />
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <Text variant="label">Answered</Text>
        <BleedRule />
        {answers.isLoading ? (
          <TallyProgress height={18} />
        ) : answered.length === 0 ? (
          <View style={{ gap: space.md }}>
            <Text variant="body" style={{ color: color.ink2 }}>
              Nothing counted yet. Your first answer starts the streak and pays out in the same transaction.
            </Text>
            <Button label="See open polls" kind="outline" onPress={() => router.navigate('/')} />
          </View>
        ) : (
          <View>
            {answered.map((a, i) => {
              const p = answers.data?.polls.get(a.poll)
              return (
                <ReceiptLine
                  key={a.address}
                  last={i === answered.length - 1}
                  onPress={() => router.push(`/poll/${a.poll}`)}
                >
                  <Text variant="body" numberOfLines={2}>
                    {p?.question ?? 'Ballot closed'}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: space.md,
                    }}
                  >
                    <Text variant="label" style={{ color: color.ink2, flex: 1 }} numberOfLines={1}>
                      {shortDate(a.answeredAt)}
                      {p ? ` · ${p.options[a.choice] ?? ''}` : ''}
                    </Text>
                    {p ? (
                      <Text variant="count" style={{ color: color.ok }}>
                        +{money(p.rewardPerAnswer, decimals)}
                      </Text>
                    ) : null}
                  </View>
                </ReceiptLine>
              )
            })}
          </View>
        )}
      </View>

      <View style={{ gap: space.md }}>
        <Text variant="label">Drafted by you</Text>
        <BleedRule />
        {created.isLoading ? (
          <TallyProgress height={18} />
        ) : drafted.length === 0 ? (
          <View style={{ gap: space.md }}>
            <Text variant="body" style={{ color: color.ink2 }}>
              You have not asked anything yet. Fund a ballot and read the tally as Seeker phones answer.
            </Text>
            <Button label="Draft a ballot" kind="outline" onPress={() => router.navigate('/create')} />
          </View>
        ) : (
          <View>
            {drafted.map((p, i) => {
              const over = p.closed || Number(p.closesAt) <= Date.now() / 1000
              return (
                <ReceiptLine
                  key={p.address}
                  last={i === drafted.length - 1}
                  onPress={() => router.push(`/poll/${p.address}`)}
                >
                  <Text variant="body" numberOfLines={2}>
                    {p.question}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <TallyCount value={p.answers} height={16} />
                    <Text variant="label" style={{ color: color.ink2 }}>
                      of {p.maxAnswers} ·{' '}
                      {p.closed ? 'closed' : over ? 'ended, close to reclaim' : `closes in ${timeLeft(p.closesAt)}`}
                    </Text>
                  </View>
                </ReceiptLine>
              )
            })}
          </View>
        )}
      </View>
    </Screen>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 }}>
      <Text variant="label" style={{ color: color.ink2 }}>
        {label}
      </Text>
      {children}
    </View>
  )
}

/** One line of the record, set like a till receipt: text, a dashed perforation, the next line. */
function ReceiptLine({ children, onPress, last }: { children: React.ReactNode; onPress: () => void; last: boolean }) {
  const { bind, ring } = useFocus(-4)
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        {...bind}
        style={({ pressed }) => [
          {
            gap: space.xs,
            paddingVertical: space.md,
            paddingHorizontal: space.lg,
            marginHorizontal: -space.lg,
            backgroundColor: pressed ? color.paper2 : 'transparent',
          },
          ring,
        ]}
      >
        {children}
      </Pressable>
      {last ? null : <DashRule />}
    </View>
  )
}
