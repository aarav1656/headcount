import Svg, { Line, Path } from 'react-native-svg'
import { color } from '@/constants/theme'

type G = { size?: number; tint?: string }

/** Solid right-pointing triangle, the printed pointer that ends every action label. */
export function Pointer({ size = 10, tint = color.ink }: G) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Path d="M2 1 L9 5 L2 9 Z" fill={tint} />
    </Svg>
  )
}

export function BackPointer({ size = 10, tint = color.ink }: G) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Path d="M8 1 L1 5 L8 9 Z" fill={tint} />
    </Svg>
  )
}

/** Stroked cross, 1.5px, for removing a ruled line. */
export function Cross({ size = 14, tint = color.ink }: G) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Line x1="2" y1="2" x2="12" y2="12" stroke={tint} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="12" y1="2" x2="2" y2="12" stroke={tint} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  )
}

export function DashRule({ tint = color.ink3 }: { tint?: string }) {
  return (
    <Svg width="100%" height={1}>
      <Line x1="0" y1="0.5" x2="100%" y2="0.5" stroke={tint} strokeWidth={1} strokeDasharray="3 3" />
    </Svg>
  )
}

/** Stroked tick, 1.5px, for confirmed states. Static: the animated tick lives in TallyBox. */
export function Tick({ size = 14, tint = color.ok }: G) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M2 7.5 L5.5 11 L12 3"
        fill="none"
        stroke={tint}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
