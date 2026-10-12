import { View } from 'react-native'
import { border, color, space } from '@/constants/theme'
import { Text } from './text'

/** Ink stamp: boxed mono caps in tally red, tilted -2deg. */
export function Stamp({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-end',
        borderWidth: border.heavy,
        borderColor: color.tally,
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
        transform: [{ rotate: '-2deg' }],
      }}
    >
      <Text variant="label" style={{ color: color.tally }}>
        {label}
      </Text>
    </View>
  )
}

/** Error line: warn-coloured plain words directly under the row that failed. */
export function Problem({ children }: { children: string }) {
  return (
    <Text variant="body" accessibilityRole="alert" style={{ color: color.warn }}>
      {children}
    </Text>
  )
}
