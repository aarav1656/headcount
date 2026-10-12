import { View } from 'react-native'
import { color } from '@/constants/theme'

type Props = { count: number; height?: number; stroke?: number; ink?: string; slash?: string }

/** Tally marks in groups of five: four upright strokes crossed by a diagonal. */
export function Tally({ count, height = 22, stroke = 3, ink = color.ink, slash = color.stamp }: Props) {
  const gap = Math.round(height * 0.3)
  const groups: number[] = []
  for (let left = count; left > 0; left -= 5) groups.push(Math.min(5, left))
  return (
    <View style={{ flexDirection: 'row', gap: gap * 1.4 }} accessibilityLabel={`${count} marks`}>
      {groups.map((n, gi) => {
        const bars = Math.min(n, 4)
        const width = bars * stroke + (bars - 1) * gap
        const len = Math.sqrt(width * width + height * height) + stroke
        const angle = Math.atan2(height, width)
        return (
          <View key={gi} style={{ width, height, flexDirection: 'row', gap }}>
            {Array.from({ length: bars }, (_, i) => (
              <View key={i} style={{ width: stroke, height, backgroundColor: ink, borderRadius: stroke / 2 }} />
            ))}
            {n === 5 && (
              <View
                style={{
                  position: 'absolute',
                  left: width / 2 - len / 2,
                  top: height / 2 - stroke / 2,
                  width: len,
                  height: stroke,
                  backgroundColor: slash,
                  borderRadius: stroke / 2,
                  transform: [{ rotate: `${-angle}rad` }],
                }}
              />
            )}
          </View>
        )
      })}
    </View>
  )
}
