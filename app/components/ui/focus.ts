import { useState } from 'react'
import { color } from '@/constants/theme'

/** Focus is a 2px tally outline that appears instantly. No transition, no fade. */
export function useFocus(offset = 2) {
  const [focused, setFocused] = useState(false)
  return {
    bind: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
    ring: focused
      ? ({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: color.tally, outlineOffset: offset } as const)
      : null,
  }
}
