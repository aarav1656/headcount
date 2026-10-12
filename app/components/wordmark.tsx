import { View } from 'react-native'
import { color, font } from '@/constants/theme'
import { Tally } from '@/components/ui/tally'
import { Text } from '@/components/ui/text'

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text
        style={{
          fontFamily: font.display,
          fontSize: size,
          lineHeight: size + 4,
          letterSpacing: -0.8,
          color: color.ink,
        }}
      >
        Headcount
      </Text>
      <Tally count={5} height={Math.round(size * 0.74)} stroke={Math.max(2, Math.round(size * 0.1))} />
    </View>
  )
}
