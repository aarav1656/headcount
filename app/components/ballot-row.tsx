import { Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { border, color, space } from '@/constants/theme'
import { Text } from '@/components/ui/text'
import { TallyBox } from '@/components/ui/ink-check'
import { useFocus } from '@/components/ui/focus'

type Props = { label: string; selected: boolean; disabled?: boolean; onPress: () => void }

/**
 * One option as a full-width row between ink rules. No box, no card.
 * Tapping draws the tick; the row ground shifts to paper2. One choice at a time.
 */
export function BallotRow({ label, selected, disabled, onPress }: Props) {
  const { bind, ring } = useFocus(-4)
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
      {...bind}
      style={({ pressed }) => [
        {
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.lg,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          borderBottomWidth: border.hair,
          borderBottomColor: color.rule,
          backgroundColor: selected || pressed ? color.paper2 : 'transparent',
        },
        ring,
      ]}
    >
      <TallyBox checked={selected} />
      <Text variant="option" style={{ flex: 1, color: disabled && !selected ? color.ink3 : color.ink }}>
        {label}
      </Text>
    </Pressable>
  )
}
