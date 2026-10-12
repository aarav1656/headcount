import { useMemo } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { PollRow } from '@/components/poll-row'
import { Wordmark } from '@/components/wordmark'
import { WalletChip } from '@/components/wallet-chip'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { color, space } from '@/constants/theme'
import { formatTokens } from '@/lib/format'
import { useMint, useMyAnswers, usePolls } from '@/features/headcount/queries'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

export default function Today() {
  const router = useRouter()
  const { account } = useHeadcountWallet()
  const polls = usePolls()
  const mint = useMint()
  const mine = useMyAnswers(account?.address)

  const now = Math.floor(Date.now() / 1000)
  const open = useMemo(
    () => (polls.data ?? []).filter((p) => !p.closed && Number(p.closesAt) > now && p.answers < p.maxAnswers),
    [polls.data, now],
  )
  const answered = useMemo(() => new Set((mine.data?.answers ?? []).map((a) => a.poll)), [mine.data])
  const decimals = mint.data?.decimals ?? 6
  const waiting = open.reduce((n, p) => n + p.rewardPerAnswer * BigInt(p.maxAnswers - p.answers), 0n)

  return (
    <Screen refreshing={polls.isRefetching} onRefresh={() => polls.refetch()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <WalletChip />
      </View>

      <View style={{ gap: space.md }}>
        <Text variant="display">One answer per Seeker phone.</Text>
        <Text variant="body" style={{ color: color.inkSoft }}>
          Projects ask. Seeker owners answer and are paid in {ACTIVE_CLUSTER.rewardLabel} in the same transaction. Bots
          and wallet farms cannot vote twice, because the count is per phone, not per wallet.
        </Text>
      </View>

      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="title">Open polls</Text>
          {open.length > 0 ? (
            <Text variant="monoSmall">
              {formatTokens(waiting, decimals)} {ACTIVE_CLUSTER.rewardLabel} to earn
            </Text>
          ) : null}
        </View>

        {polls.isLoading ? (
          <View style={{ paddingVertical: space.xl, alignItems: 'center', gap: space.sm }}>
            <ActivityIndicator color={color.stamp} />
            <Text variant="monoSmall">Reading polls from {ACTIVE_CLUSTER.key}</Text>
          </View>
        ) : polls.isError ? (
          <Empty
            title="Could not load polls"
            body={`The ${ACTIVE_CLUSTER.key} RPC did not answer. Check your connection, then try again.`}
            actionLabel="Try again"
            onAction={() => polls.refetch()}
          />
        ) : open.length === 0 ? (
          <Empty
            title="No open polls right now"
            body="Every poll is closed or fully answered. Fund the next one and Seeker owners will see it here."
            marks={5}
            actionLabel="Create a poll"
            onAction={() => router.navigate('/create')}
          />
        ) : (
          open.map((p) => (
            <PollRow
              key={p.address}
              poll={p}
              decimals={decimals}
              answered={answered.has(p.address)}
              onPress={() => router.push(`/poll/${p.address}`)}
            />
          ))
        )}
      </View>

      {open.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text variant="small">
            Need a count of your own users? Fund a poll and read the tally when phones answer.
          </Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label="Create a poll" kind="secondary" onPress={() => router.navigate('/create')} />
          </View>
        </View>
      ) : null}
    </Screen>
  )
}
