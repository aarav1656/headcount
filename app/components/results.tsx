import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import { border, color, motion, space } from '@/constants/theme'
import { Text } from '@/components/ui/text'
import { Tick } from '@/components/ui/glyphs'
import { TallyCount } from '@/components/ui/tally'
import { useReducedMotion } from '@/components/ui/motion'
import type { Poll } from '@/lib/headcount/program'

type Series = { key: 'seekers' | 'all'; name: string; votes: number[]; total: number; tint: string }

const GAP_POINTS = 10
const sum = (v: number[]) => v.reduce((n, x) => n + x, 0)
const shareOf = (s: Series, i: number) => (s.total > 0 ? ((s.votes[i] ?? 0) / s.total) * 100 : 0)

/**
 * Results print. Each option gets two hatched bars, Seeker phones in tally red and All answers in ink.
 * Bars grow from zero once, 400ms ease-out. The distance between the two is the story, and it is
 * labelled "bot gap" when it is wider than ten points.
 */
export function Results({ poll, yourChoice }: { poll: Poll; yourChoice?: number }) {
  const reduce = useReducedMotion()
  const grow = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduce) {
      grow.setValue(1)
      return
    }
    Animated.timing(grow, {
      toValue: 1,
      duration: motion.bars,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [reduce, grow])

  const seekers: Series = {
    key: 'seekers',
    name: 'Seeker phones',
    votes: poll.seekerTallies,
    total: sum(poll.seekerTallies),
    tint: color.tally,
  }
  const all: Series = {
    key: 'all',
    name: 'All answers',
    votes: poll.tallies,
    total: sum(poll.tallies),
    tint: color.ink,
  }
  const series = poll.seekersOnly ? [seekers] : [seekers, all]
  const lead = poll.seekersOnly || seekers.total > 0 ? seekers : all
  const top = Math.max(...lead.votes, 0)
  const leaders = lead.votes.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0)
  const wallets = all.total - seekers.total

  return (
    <View style={{ gap: space.xl }}>
      {lead.total > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label" style={{ color: lead.tint }}>
            {leaders.length > 1 ? 'Tied' : 'Leading'} · {lead.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
            <Text variant="bigNumber" style={{ color: lead.tint }}>
              {Math.round(shareOf(lead, leaders[0]))}%
            </Text>
            <Text variant="option" style={{ flex: 1 }}>
              {leaders.map((i) => poll.options[i]).join(' / ')}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ borderTopWidth: border.hair, borderTopColor: color.rule }}>
        {poll.options.map((label, i) => {
          const gap = Math.abs(shareOf(all, i) - shareOf(seekers, i))
          const showGap = !poll.seekersOnly && seekers.total > 0 && gap > GAP_POINTS
          return (
            <View
              key={i}
              style={{
                gap: space.sm,
                paddingVertical: space.lg,
                borderBottomWidth: border.hair,
                borderBottomColor: color.rule,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text variant="option" style={{ flexShrink: 1 }}>
                  {label}
                </Text>
                {yourChoice === i ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                    <Tick tint={color.tally} />
                    <Text variant="label" style={{ color: color.tally }}>
                      You
                    </Text>
                  </View>
                ) : null}
              </View>
              {series.map((s) => (
                <Bar key={s.key} series={s} share={shareOf(s, i)} votes={s.votes[i] ?? 0} grow={grow} />
              ))}
              {showGap ? (
                <Text variant="label" style={{ color: color.tally, alignSelf: 'flex-end' }}>
                  Bot gap · {Math.round(gap)} pts
                </Text>
              ) : null}
            </View>
          )
        })}
      </View>

      <View style={{ gap: space.md }}>
        <Count name="Seeker phones" value={seekers.total} tint={color.tally} />
        {poll.seekersOnly ? (
          <Text variant="fine">One answer per Seeker phone. A tally here is that many distinct devices.</Text>
        ) : (
          <>
            <Count name="All answers" value={all.total} tint={color.ink} />
            <Text variant="fine">
              {seekers.total === 0
                ? 'No Seeker phone has answered yet, so there is no gap to read.'
                : `${wallets} of ${all.total} came from wallets with no Seeker.`}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

function Count({ name, value, tint }: { name: string; value: number; tint: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
      <Text variant="label" style={{ color: color.ink2 }}>
        {name}
      </Text>
      <TallyCount value={value} height={18} tint={tint} />
    </View>
  )
}

function Bar({ series, share, votes, grow }: { series: Series; share: number; votes: number; grow: Animated.Value }) {
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${share}%`] })
  const id = `hatch-${series.key}`
  return (
    <View
      accessible
      accessibilityLabel={`${series.name}: ${votes} ${votes === 1 ? 'answer' : 'answers'}, ${Math.round(share)} percent`}
      style={{ gap: space.xs }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" style={{ color: series.tint }}>
          {series.name}
        </Text>
        <Text variant="count" style={{ color: series.tint }}>
          {Math.round(share)}%
        </Text>
      </View>
      <View style={{ height: 16, borderWidth: border.hair, borderColor: series.tint, backgroundColor: color.paper }}>
        <Animated.View style={{ height: '100%', width, overflow: 'hidden' }}>
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern id={id} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
                <Line x1={0} y1={0} x2={0} y2={5} stroke={series.tint} strokeWidth={2} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
          <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, backgroundColor: series.tint }} />
        </Animated.View>
      </View>
    </View>
  )
}
