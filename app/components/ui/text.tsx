import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { color, font } from '@/constants/theme'

const variants = {
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 42, letterSpacing: -1, color: color.ink },
  title: { fontFamily: font.displayMid, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, color: color.ink },
  question: { fontFamily: font.displaySemi, fontSize: 18, lineHeight: 23, letterSpacing: -0.2, color: color.ink },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: color.ink },
  bodyStrong: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 23, color: color.ink },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.inkSoft },
  mono: { fontFamily: font.monoMedium, fontSize: 14, lineHeight: 20, color: color.ink },
  monoSmall: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, color: color.inkSoft },
  figure: { fontFamily: font.monoSemi, fontSize: 30, lineHeight: 34, letterSpacing: -1, color: color.ink },
} satisfies Record<string, TextStyle>

export type Variant = keyof typeof variants

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText {...rest} style={[variants[variant], style]} />
}
