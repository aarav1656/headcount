import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { border, color, motion, radius } from '@/constants/theme'
import { useReducedMotion } from './motion'

const LENGTH = 21

/**
 * The 22px tally box. Checking it draws an ink tick in tally red, stroke by stroke, in 180ms.
 * Reduced motion jumps to the finished tick.
 */
export function TallyBox({ checked, size = 22 }: { checked: boolean; size?: number }) {
  const reduce = useReducedMotion()
  const progress = useRef(new Animated.Value(checked ? 1 : 0)).current
  const [offset, setOffset] = useState(checked ? 0 : LENGTH)

  useEffect(() => {
    const id = progress.addListener(({ value }) => setOffset(LENGTH * (1 - value)))
    return () => progress.removeListener(id)
  }, [progress])

  useEffect(() => {
    if (!checked) {
      progress.setValue(0)
      return
    }
    if (reduce) {
      progress.setValue(1)
      return
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.check,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [checked, reduce, progress])

  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: border.hair,
        borderColor: color.ink,
        borderRadius: radius.box,
        backgroundColor: color.paper,
      }}
    >
      <Svg width={size - 2} height={size - 2} viewBox="0 0 22 22">
        {offset < LENGTH ? (
          <Path
            d="M4.5 12 L9.5 16.5 L18 5"
            fill="none"
            stroke={color.tally}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${LENGTH} ${LENGTH}`}
            strokeDashoffset={offset}
          />
        ) : null}
      </Svg>
    </View>
  )
}
