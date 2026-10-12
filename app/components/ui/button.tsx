import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native'
import { color, font, radius } from '@/constants/theme'
import { Text } from './text'

type Props = Omit<PressableProps, 'children'> & {
  label: string
  kind?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
}

export function Button({ label, kind = 'primary', loading, disabled, style, ...rest }: Props) {
  const off = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      android_ripple={{ color: kind === 'primary' ? color.stampDeep : color.rule }}
      style={(s) => [
        styles.base,
        styles[kind],
        s.pressed && (kind === 'primary' ? styles.primaryPressed : styles.otherPressed),
        off && styles.off,
        typeof style === 'function' ? style(s) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={kind === 'primary' ? color.onStamp : color.ink} />
      ) : (
        <Text
          style={{
            fontFamily: font.bodySemi,
            fontSize: 16,
            color: kind === 'primary' ? color.onStamp : color.ink,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: { backgroundColor: color.stamp },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: color.ink },
  ghost: { backgroundColor: 'transparent', minHeight: 44 },
  primaryPressed: { backgroundColor: color.stampDeep },
  otherPressed: { backgroundColor: color.paperDeep },
  off: { opacity: 0.45 },
})
