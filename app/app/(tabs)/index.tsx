import { useMemo } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen, BleedRule } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Problem } from '@/components/ui/stamp'
import { TallyProgress } from '@/components/ui/tally'
import { PollRow } from '@/components/poll-row'
import { UNIT } from '@/utils/skr'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { color, space } from '@/constants/theme'
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

  return (
    <Screen wallet refreshing={polls.isRefetching} onRefresh={() => polls.refetch()}>
      <Text variant="body" style={{ color: color.ink2 }}>
        Every answer here comes from a different phone. Answer, get paid in {UNIT}.
      </Text>

      <View style={{ gap: space.md }}>
        <View style={{ gap: space.sm }}>
          <Text variant="label">Open ballots{open.length > 0 ? ` · ${open.length}` : ''}</Text>
          <BleedRule />
        </View>

        {polls.isLoading ? (
          <View style={{ paddingVertical: space.xl, gap: space.md }}>
            <TallyProgress height={22} />
            <Text variant="label" style={{ color: color.ink2 }}>
              Reading the ballot box on {ACTIVE_CLUSTER.key}
            </Text>
          </View>
        ) : polls.isError ? (
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <Problem>{`The ${ACTIVE_CLUSTER.key} network did not answer. Check your connection, then try again.`}</Problem>
            <Button label="Try again" kind="outline" onPress={() => polls.refetch()} />
          </View>
        ) : open.length === 0 ? (
          <View style={{ gap: space.lg, paddingVertical: space.lg }}>
            <Text variant="question">No open ballots right now.</Text>
            <Text variant="body" style={{ color: color.ink2 }}>
              Draft one, or check back after the next issue.
            </Text>
            <Button label="Draft a ballot" kind="outline" onPress={() => router.navigate('/create')} />
          </View>
        ) : (
          <View>
            {open.map((p) => (
              <PollRow
                key={p.address}
                poll={p}
                decimals={decimals}
                answered={answered.has(p.address)}
                onPress={() => router.push(`/poll/${p.address}`)}
              />
            ))}
          </View>
        )}
      </View>

      {open.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text variant="body" style={{ color: color.ink2 }}>
            Need a count of your own users? Fund a ballot and read the tally as phones answer.
          </Text>
          <Button label="Draft a ballot" kind="link" onPress={() => router.navigate('/create')} />
        </View>
      ) : null}
    </Screen>
  )
}
