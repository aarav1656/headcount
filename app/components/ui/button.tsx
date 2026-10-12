import { Pressable, View, type PressableProps } from 'react-native'
import { border, color, space } from '@/constants/theme'
import { Text } from './text'
import { Pointer } from './glyphs'
import { useFocus } from './focus'
import { TallyProgress } from './tally'

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string
  /** bar: ink-filled full-width. outline: 1px ink rule. link: bare mono text. */
  kind?: 'bar' | 'outline' | 'link'
  loading?: boolean
  pointer?: boolean
}

/**
 * States: default, pressed (tally fill on the bar, paper2 elsewhere), focus (2px tally outline),
 * disabled (ink3 text, no fill), loading (COUNTING with five tally marks filling in).
 */
export function Button({ label, kind = 'bar', loading, disabled, pointer = true, ...rest }: Props) {
  const off = !!disabled && !loading
  const { bind, ring } = useFocus()
  const inactive = disabled || loading
  const bar = kind === 'bar'
  const link = kind === 'link'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...bind}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: link ? 44 : 56,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: link ? 'flex-start' : 'space-between',
          gap: space.md,
          paddingHorizontal: link ? 0 : space.lg,
          borderWidth: link ? 0 : border.hair,
          borderColor: off ? color.ink3 : color.ink,
          backgroundColor: loading
            ? color.paper
            : off || link
              ? 'transparent'
              : bar
                ? pressed
                  ? color.tally
                  : color.ink
                : pressed
                  ? color.paper2
                  : 'transparent',
        },
        ring,
      ]}
    >
      {({ pressed }) => {
        const ink = loading
          ? color.ink
          : off
            ? color.ink3
            : bar
              ? pressed
                ? color.tallyInk
                : color.paper
              : pressed && link
                ? color.tally
                : color.ink
        return (
          <>
            <Text variant="action" style={{ color: ink, flexShrink: 1 }} numberOfLines={1}>
              {loading ? 'Counting…' : label}
            </Text>
            {loading ? (
              <TallyProgress height={18} tint={color.ink} />
            ) : pointer ? (
              <View>
                <Pointer tint={ink} />
              </View>
            ) : null}
          </>
        )
      }}
    </Pressable>
  )
}
