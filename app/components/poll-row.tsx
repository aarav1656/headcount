import { Pressable, View } from 'react-native'
import { border, color, space } from '@/constants/theme'
import { UNIT } from '@/utils/skr'
import { Text, questionVariant } from '@/components/ui/text'
import { TallyCount } from '@/components/ui/tally'
import { Tick } from '@/components/ui/glyphs'
import { useFocus } from '@/components/ui/focus'
import { formatTokens } from '@/lib/format'
import { PollMeta } from '@/components/poll-meta'
import type { Poll } from '@/lib/headcount/program'

type Props = { poll: Poll; decimals: number; answered?: boolean; onPress: () => void }

/** One item in the column: the question in display serif, a mono meta line, a rule underneath. */
export function PollRow({ poll, decimals, answered, onPress }: Props) {
  const left = poll.maxAnswers - poll.answers
  const { bind, ring } = useFocus(-4)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${poll.question}. Pays ${formatTokens(poll.rewardPerAnswer, decimals)} ${UNIT}. ${left} answers left. ${poll.seekersOnly ? 'Seekers only' : 'Open to any wallet'}.`}
      onPress={onPress}
      {...bind}
      style={({ pressed }) => [
        {
          gap: space.md,
          paddingVertical: space.lg,
          paddingHorizontal: space.lg,
          marginHorizontal: -space.lg,
          borderBottomWidth: border.hair,
          borderBottomColor: color.rule,
          backgroundColor: pressed ? color.paper2 : 'transparent',
        },
        ring,
      ]}
    >
      <Text variant={questionVariant(poll.question)}>{poll.question}</Text>
      <PollMeta poll={poll} decimals={decimals} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text variant="label" style={{ color: color.ink3, width: 88 }}>
            Answered
          </Text>
          <TallyCount value={poll.answers} height={18} />
        </View>
        {answered ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Tick />
            <Text variant="label" style={{ color: color.ok }}>
              Yours
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
