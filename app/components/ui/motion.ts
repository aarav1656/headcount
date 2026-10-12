import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** True when the system asks for reduced motion. Animated parts jump to their end state. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (live) setReduce(v)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return reduce
}
