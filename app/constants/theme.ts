import type { TextStyle } from 'react-native'

// Ballot paper: the only place a colour, font or type size is defined. Components import from here.
// Warm newsprint, ink, and one red pencil. Radius is zero everywhere; paper has corners.
export const color = {
  paper: '#F3EEE3',
  paper2: '#E9E2D3',
  ink: '#17150F',
  ink2: '#4A453B',
  ink3: '#8A8374',
  rule: '#17150F',
  tally: '#C7361F',
  tallyInk: '#F3EEE3',
  ok: '#2F6B3A',
  warn: '#A8571B',
} as const

export const font = {
  display: 'Newsreader_600SemiBold',
  displayBold: 'Newsreader_700Bold',
  displayMedium: 'Newsreader_500Medium',
  displayRegular: 'Newsreader_400Regular',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const

export const radius = { none: 0, box: 2 } as const

export const border = {
  hair: 1,
  heavy: 2,
  /** Masthead double rule: 2px, 3px gap, 1px. */
  doubleTop: 2,
  doubleGap: 3,
  doubleBottom: 1,
} as const

export const motion = {
  check: 180,
  bars: 400,
  receipt: 240,
} as const

/** Named type styles from DESIGN.md. Numbers are tabular wherever they sit in a column. */
export const text = {
  masthead: {
    fontFamily: font.displayBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: color.ink,
  },
  question: { fontFamily: font.display, fontSize: 30, lineHeight: 34, color: color.ink },
  questionLong: { fontFamily: font.display, fontSize: 26, lineHeight: 30, color: color.ink },
  option: { fontFamily: font.displayMedium, fontSize: 20, lineHeight: 26, color: color.ink },
  body: { fontFamily: font.displayRegular, fontSize: 17, lineHeight: 24, color: color.ink },
  label: {
    fontFamily: font.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.ink,
  },
  count: {
    fontFamily: font.monoSemi,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
    color: color.ink,
  },
  bigNumber: {
    fontFamily: font.displayBold,
    fontSize: 56,
    lineHeight: 56,
    fontVariant: ['tabular-nums'],
    color: color.ink,
  },
  action: {
    fontFamily: font.monoSemi,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.ink,
  },
  /** Mono 400 for fine print and form values: the third weight of the mono family. */
  fine: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: color.ink2 },
  value: { fontFamily: font.monoMedium, fontSize: 17, lineHeight: 24, fontVariant: ['tabular-nums'], color: color.ink },
} satisfies Record<string, TextStyle>
