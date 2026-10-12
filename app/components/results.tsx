import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing, View } from 'react-native'
import { color, font, space } from '@/constants/theme'
import { Text } from '@/components/ui/text'
import type { Poll } from '@/lib/headcount/program'

/** Tally bars. Widths grow from zero once, staggered, when results are revealed. */
export function Results({ poll, yourChoice }: { poll: Poll; yourChoice?: number }) {
  const total = poll.tallies.reduce((n, v) => n + v, 0)
  const max = Math.max(...poll.tallies, 0)
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

  return (
    <View style={{ gap: space.lg }}>
      {poll.options.map((label, i) => {
        const votes = poll.tallies[i] ?? 0
        const pct = total > 0 ? Math.round((votes / total) * 100) : 0
        const lead = total > 0 && votes === max
        const width = progress[i].interpolate({
          inputRange: [0, 1],
          outputRange: ['0%', `${total > 0 ? (votes / total) * 100 : 0}%`],
        })
        return (
          <View key={i} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {label}
                {yourChoice === i ? '  (you)' : ''}
              </Text>
              <Text style={{ fontFamily: font.monoSemi, fontSize: 14, color: color.ink }}>
                {votes} · {pct}%
              </Text>
            </View>
            <View style={{ height: 12, backgroundColor: color.paperDeep, borderRadius: 2 }}>
              <Animated.View
                style={{ height: 12, width, backgroundColor: lead ? color.stamp : color.ink, borderRadius: 2 }}
              />
            </View>
          </View>
        )
      })}
      <Text variant="monoSmall">
        {total} {total === 1 ? 'phone has' : 'phones have'} answered, one answer per Seeker.
      </Text>
    </View>
  )
}
