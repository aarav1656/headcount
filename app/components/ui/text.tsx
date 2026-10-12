import { Text as RNText, type TextProps } from 'react-native'
import { text } from '@/constants/theme'

export type Variant = keyof typeof text

/** Every string in the app is set through here, so the type scale lives in constants/theme.ts only. */
export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText {...rest} style={[text[variant], style]} />
}

/** DESIGN.md: questions set at 30/34, or 26/30 once they pass 60 characters. */
export function questionVariant(question: string): 'question' | 'questionLong' {
  return question.length > 60 ? 'questionLong' : 'question'
}
