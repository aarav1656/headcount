// Census paper: a counted-by-hand ledger. Warm paper, ink, and one vermilion stamp colour.
// Green, amber and red are reserved for success, warning and failure.
export const color = {
  paper: '#F3EFE4',
  paperDeep: '#E8E2D0',
  card: '#FBF9F3',
  ink: '#17150F',
  inkSoft: '#5A554A',
  inkFaint: '#8B8573',
  rule: '#D5CEB8',
  stamp: '#CC3B17',
  stampDeep: '#A82E10',
  onStamp: '#FFF8F2',
  success: '#2B6A3A',
  warn: '#9A6A0B',
  danger: '#A6261C',
} as const

export const font = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayMid: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const
export const radius = { sm: 4, md: 8, lg: 14 } as const
