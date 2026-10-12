import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Svg, { Line } from 'react-native-svg'
import { color } from '@/constants/theme'
import { Text } from './text'
import { useReducedMotion } from './motion'

const STROKE = 2

type MarksProps = { count: number; height?: number; tint?: string; slash?: string }

const widthOf = (count: number, height: number) => {
  const gap = Math.round(height * 0.42)
  const groups = Math.ceil(count / 5)
  return groups * (gap * 3 + STROKE) + (groups - 1) * (gap + 6) + STROKE * 2
}

/** Tally marks in groups of five: four upright strokes crossed by one diagonal. */
export function TallyMarks({ count, height = 20, tint = color.ink, slash }: MarksProps) {
  const gap = Math.round(height * 0.42)
  const groupW = gap * 3 + STROKE
  const between = gap + 6
  const groups = Math.ceil(count / 5)
  const width = groups * groupW + (groups - 1) * between
  const pad = STROKE
  const lines = []
  for (let g = 0; g < groups; g++) {
    const n = Math.min(5, count - g * 5)
    const x0 = pad + g * (groupW + between)
    for (let i = 0; i < Math.min(n, 4); i++) {
      const x = x0 + i * gap
      lines.push(
        <Line
          key={`${g}-${i}`}
          x1={x}
          y1={pad}
          x2={x}
          y2={height - pad}
          stroke={tint}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      )
    }
    if (n === 5) {
      lines.push(
        <Line
          key={`${g}-s`}
          x1={x0 - 3}
          y1={height - pad - 1}
          x2={x0 + groupW + 1}
          y2={pad + 1}
          stroke={slash ?? tint}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />,
      )
    }
  }
  return (
    <Svg width={width + pad * 2} height={height}>
      {lines}
    </Svg>
  )
}

/** DESIGN.md move 6: tally marks up to 20, mono digits above. Zero reads as a digit, never as nothing. */
export function TallyCount({
  value,
  height = 20,
  tint = color.ink,
  slash,
  ghost,
}: {
  value: number
  height?: number
  tint?: string
  slash?: string
  /** Faint marks out to the next five, so a short run still reads as a count toward a group. */
  ghost?: boolean
}) {
  return (
    <View accessible accessibilityLabel={`${value}`}>
      {value > 0 && value <= 20 ? (
        <View>
          {ghost && value % 5 !== 0 ? (
            <View style={{ opacity: 0.2, position: 'absolute' }}>
              <TallyMarks count={Math.ceil(value / 5) * 5} height={height} tint={tint} slash={slash} />
            </View>
          ) : null}
          <TallyMarks count={value} height={height} tint={tint} slash={slash} />
        </View>
      ) : (
        <Text variant="count" style={{ color: tint }}>
          {value}
        </Text>
      )}
    </View>
  )
}

/** Five tally marks that fill left to right; the fifth slashes across the four. Loops while mounted. */
export function TallyProgress({
  height = 16,
  tint = color.ink,
  slash,
}: {
  height?: number
  tint?: string
  slash?: string
}) {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setStep((s) => (s >= 6 ? 0 : s + 1)), 260)
    return () => clearInterval(id)
  }, [reduce])
  const shown = reduce ? 5 : Math.min(step, 5)
  return (
    <View style={{ height, width: widthOf(5, height) }}>
      <View style={{ opacity: 0.18, position: 'absolute' }}>
        <TallyMarks count={5} height={height} tint={tint} slash={slash} />
      </View>
      {shown > 0 ? <TallyMarks count={shown} height={height} tint={tint} slash={slash} /> : null}
    </View>
  )
}
