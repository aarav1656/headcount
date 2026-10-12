import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing, View } from 'react-native'
import { color, font, space } from '@/constants/theme'
import { Text } from '@/components/ui/text'
import type { Poll } from '@/lib/headcount/program'

type Series = { name: string; votes: number[]; total: number; fill: string }

/**
 * Tally bars. Widths grow from zero once, staggered, when results are revealed.
 * A Seekers-only poll has one series. An open poll shows Seeker phones beside All answers,
 * and the distance between the two is the bot gap.
 */
export function Results({ poll, yourChoice }: { poll: Poll; yourChoice?: number }) {
  const progress = useRef(poll.options.map(() => new Animated.Value(0))).current

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return
      const anims = progress.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: reduce ? 0 : 650,
          delay: reduce ? 0 : i * 90,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      )
      Animated.parallel(anims).start()
    })
    return () => {
      cancelled = true
    }
  }, [progress])

  const all: Series = {
    name: 'All answers',
    votes: poll.tallies,
    total: poll.tallies.reduce((n, v) => n + v, 0),
    fill: color.ink,
  }
  const seekers: Series = {
    name: 'Seeker phones',
    votes: poll.seekerTallies,
    total: poll.seekerTallies.reduce((n, v) => n + v, 0),
    fill: color.stamp,
  }
  const series = poll.seekersOnly ? [seekers] : [seekers, all]
  const wallets = all.total - seekers.total

  return (
    <View style={{ gap: space.lg }}>
      {poll.options.map((label, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Text variant="bodyStrong">
            {label}
            {yourChoice === i ? '  (you)' : ''}
          </Text>
          {series.map((s) => {
            const votes = s.votes[i] ?? 0
            const share = s.total > 0 ? (votes / s.total) * 100 : 0
            const width = progress[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', `${share}%`] })
            return (
              <View
                key={s.name}
                accessible
                accessibilityLabel={`${s.name}: ${votes} votes, ${Math.round(share)} percent`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
              >
                {poll.seekersOnly ? null : (
                  <Text variant="monoSmall" style={{ width: 92 }}>
                    {s.name}
                  </Text>
                )}
                <View style={{ flex: 1, height: 12, backgroundColor: color.paperDeep, borderRadius: 2 }}>
                  <Animated.View style={{ height: 12, width, backgroundColor: s.fill, borderRadius: 2 }} />
                </View>
                <Text style={{ fontFamily: font.monoSemi, fontSize: 14, color: color.ink, minWidth: 64, textAlign: 'right' }}>
                  {votes} · {Math.round(share)}%
                </Text>
              </View>
            )
          })}
        </View>
      ))}
      <Text variant="monoSmall">
        {poll.seekersOnly
          ? `${seekers.total} ${seekers.total === 1 ? 'phone has' : 'phones have'} answered, one answer per Seeker.`
          : `${seekers.total} Seeker ${seekers.total === 1 ? 'phone' : 'phones'} of ${all.total} ${all.total === 1 ? 'answer' : 'answers'}. ${wallets} came from wallets with no Seeker.`}
      </Text>
    </View>
  )
}
