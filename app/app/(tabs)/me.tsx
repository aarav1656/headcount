import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Tally } from '@/components/ui/tally'
import { WalletChip } from '@/components/wallet-chip'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { color, font, radius, space } from '@/constants/theme'
import { answerDays, currentStreak, formatTokens, lastSevenDays, timeLeft } from '@/lib/format'
import { describeError } from '@/lib/headcount/errors'
import { useMint, useMyAnswers, useMyPolls } from '@/features/headcount/queries'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

export default function Me() {
  const router = useRouter()
  const { account, connect } = useHeadcountWallet()
  const mint = useMint()
  const answers = useMyAnswers(account?.address)
  const created = useMyPolls(account?.address)
  const [error, setError] = useState<string | null>(null)
  const decimals = mint.data?.decimals ?? 6
  const label = ACTIVE_CLUSTER.rewardLabel

  const stats = useMemo(() => {
    const list = answers.data?.answers ?? []
    const earned = list.reduce((n, a) => n + (answers.data?.polls.get(a.poll)?.rewardPerAnswer ?? 0n), 0n)
    const days = answerDays(list.map((a) => a.answeredAt))
    return { earned, count: list.length, streak: currentStreak(days), week: lastSevenDays(days) }
  }, [answers.data])

  if (!account) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="title">Me</Text>
        </View>
        <Empty
          title="Connect a wallet to see your count"
          body={`Your answers, your ${label} earned and your streak are read from the chain for the wallet you connect.`}
          marks={3}
          actionLabel="Connect wallet"
          onAction={() =>
            connect().catch((e) => {
              const d = describeError(e)
              if (!d.cancelled) setError(d.message)
            })
          }
        />
        {error ? (
          <Text variant="small" style={{ color: color.danger }}>
            {error}
          </Text>
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen
      refreshing={answers.isRefetching || created.isRefetching}
      onRefresh={() => {
        answers.refetch()
        created.refetch()
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Me</Text>
        <WalletChip />
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="small">Earned from answering</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Text variant="figure" style={{ fontSize: 44, lineHeight: 48 }}>
            {answers.isLoading ? '...' : formatTokens(stats.earned, decimals)}
          </Text>
          <Text variant="mono">{label}</Text>
        </View>
        <Text variant="monoSmall">
          from {stats.count} {stats.count === 1 ? 'answer' : 'answers'}
        </Text>
      </View>

      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="title">Streak</Text>
          <Text variant="mono">
            {stats.streak} {stats.streak === 1 ? 'day' : 'days'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {stats.week.map((d, i) => (
            <View
              key={i}
              accessibilityLabel={`${d.label}${d.today ? ' today' : ''}: ${d.answered ? 'answered' : 'no answer'}`}
              style={{
                flex: 1,
                height: 52,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderWidth: d.today ? 2 : 1,
                borderColor: d.today ? color.ink : color.rule,
                backgroundColor: d.answered ? color.card : 'transparent',
              }}
            >
              {d.answered ? (
                <Tally count={1} height={16} stroke={3} ink={color.stamp} />
              ) : (
                <View style={{ height: 16 }} />
              )}
              <Text style={{ fontFamily: font.monoMedium, fontSize: 11, color: color.inkSoft }}>{d.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <Text variant="title">Your answers</Text>
        {answers.isLoading ? (
          <ActivityIndicator color={color.stamp} />
        ) : (answers.data?.answers.length ?? 0) === 0 ? (
          <Empty
            title="No answers from this wallet yet"
            body="Open Today, pick a poll and answer it. Your first answer starts the streak and pays out right away."
            actionLabel="See open polls"
            onAction={() => router.navigate('/')}
          />
        ) : (
          answers.data!.answers.map((a) => {
            const p = answers.data!.polls.get(a.poll)
            return (
              <Pressable
                key={a.address}
                accessibilityRole="button"
                onPress={() => router.push(`/poll/${a.poll}`)}
                style={({ pressed }) => ({
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderBottomColor: color.rule,
                  gap: 4,
                  backgroundColor: pressed ? color.paperDeep : 'transparent',
                })}
              >
                <Text variant="question">{p?.question ?? 'Poll closed'}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="monoSmall">
                    {p ? `You: ${p.options[a.choice] ?? '?'}` : ''} ·{' '}
                    {new Date(Number(a.answeredAt) * 1000).toLocaleDateString()}
                  </Text>
                  {p ? (
                    <Text style={{ fontFamily: font.monoSemi, fontSize: 12, color: color.success }}>
                      +{formatTokens(p.rewardPerAnswer, decimals)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          })
        )}
      </View>

      <View style={{ gap: space.xs }}>
        <Text variant="title">Polls you created</Text>
        {created.isLoading ? (
          <ActivityIndicator color={color.stamp} />
        ) : (created.data?.length ?? 0) === 0 ? (
          <Empty
            title="You have not asked anything yet"
            body="Fund a poll and read the tally as Seeker phones answer. Only you can see results before you answer."
            actionLabel="Create a poll"
            onAction={() => router.navigate('/create')}
          />
        ) : (
          created.data!.map((p) => {
            const over = p.closed || Number(p.closesAt) <= Date.now() / 1000
            return (
              <Pressable
                key={p.address}
                accessibilityRole="button"
                onPress={() => router.push(`/poll/${p.address}`)}
                style={({ pressed }) => ({
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderBottomColor: color.rule,
                  gap: 4,
                  backgroundColor: pressed ? color.paperDeep : 'transparent',
                })}
              >
                <Text variant="question">{p.question}</Text>
                <Text variant="monoSmall">
                  {p.answers} of {p.maxAnswers} answered ·{' '}
                  {p.closed
                    ? 'closed'
                    : over
                      ? 'ended, close it to reclaim rewards'
                      : `closes in ${timeLeft(p.closesAt)}`}
                </Text>
              </Pressable>
            )
          })
        )}
      </View>
      {error ? <Button label="Dismiss" kind="ghost" onPress={() => setError(null)} /> : null}
    </Screen>
  )
}
