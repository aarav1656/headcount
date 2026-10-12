import { View } from 'react-native'
import { color } from '@/constants/theme'
import { UNIT } from '@/utils/skr'
import { Text } from '@/components/ui/text'
import { formatTokens, timeLeft } from '@/lib/format'
import type { Poll } from '@/lib/headcount/program'

type Props = { poll: Poll; decimals: number; ended?: boolean; hideSeekers?: boolean }

/**
 * `5 SKR · 197 LEFT · CLOSES IN 6D`, with `SEEKERS ONLY` on its own line beneath in tally red.
 * The poll screen already carries the stamp, so it passes hideSeekers.
 */
export function PollMeta({ poll, decimals, ended, hideSeekers }: Props) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="label" style={{ color: color.ink2 }}>
        {formatTokens(poll.rewardPerAnswer, decimals)} {UNIT} · {poll.maxAnswers - poll.answers} left ·{' '}
        {ended ? 'ended' : `closes in ${timeLeft(poll.closesAt)}`}
      </Text>
      {poll.seekersOnly && !hideSeekers ? (
        <Text variant="label" style={{ color: color.tally }}>
          Seekers only
        </Text>
      ) : null}
    </View>
  )
}
