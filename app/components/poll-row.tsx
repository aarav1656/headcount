import { Pressable, View } from 'react-native'
import { color, space } from '@/constants/theme'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { Text } from '@/components/ui/text'
import { formatTokens, timeLeft } from '@/lib/format'
import type { Poll } from '@/lib/headcount/program'

type Props = { poll: Poll; decimals: number; answered?: boolean; onPress: () => void }

/** One ledger line: what it pays, what it asks, how many slots and how long are left. */
export function PollRow({ poll, decimals, answered, onPress }: Props) {
  const left = poll.maxAnswers - poll.answers
  const filled = poll.maxAnswers > 0 ? poll.answers / poll.maxAnswers : 0
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${poll.question}. Pays ${formatTokens(poll.rewardPerAnswer, decimals)} ${ACTIVE_CLUSTER.rewardLabel}. ${left} answers left.`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: space.lg,
        paddingVertical: space.lg,
        paddingHorizontal: space.sm,
        marginHorizontal: -space.sm,
        borderBottomWidth: 1,
        borderBottomColor: color.rule,
        backgroundColor: pressed ? color.paperDeep : 'transparent',
      })}
    >
      <View style={{ width: 96 }}>
        <Text variant="figure">{formatTokens(poll.rewardPerAnswer, decimals)}</Text>
        <Text variant="monoSmall">{ACTIVE_CLUSTER.rewardLabel}</Text>
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        <Text variant="question">{poll.question}</Text>
        <View style={{ height: 3, backgroundColor: color.rule, borderRadius: 2 }}>
          <View
            style={{ height: 3, width: `${Math.round(filled * 100)}%`, backgroundColor: color.ink, borderRadius: 2 }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="monoSmall">
            {left} left of {poll.maxAnswers}
          </Text>
          {answered ? (
            <Text variant="monoSmall" style={{ color: color.success }}>
              answered
            </Text>
          ) : (
            <Text variant="monoSmall">closes in {timeLeft(poll.closesAt)}</Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}
