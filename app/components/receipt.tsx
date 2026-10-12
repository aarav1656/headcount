import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Linking, Pressable, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { border, color, motion, space } from '@/constants/theme'
import { explorerTx } from '@/constants/headcount'
import { ellipsify } from '@/utils/ellipsify'
import { Text } from '@/components/ui/text'
import { DashRule, Pointer, Tick } from '@/components/ui/glyphs'
import { useFocus } from '@/components/ui/focus'
import { useReducedMotion } from '@/components/ui/motion'

const DEPTH = 10

/** Deterministic torn edge: tooth width and height vary with the signature, so every receipt tears differently. */
function tornEdge(width: number, seed: string): string {
  let x = 0
  let i = 0
  let d = `M0 ${DEPTH}`
  while (x < width) {
    const c = seed.charCodeAt(i % seed.length)
    const w = 9 + (c % 5)
    const peak = 3 + ((c * 7) % 5)
    const nx = Math.min(width, x + w)
    d += ` L${(x + (nx - x) / 2).toFixed(1)} ${peak} L${nx.toFixed(1)} ${DEPTH}`
    x = nx
    i++
  }
  return d
}

type Props = { question: string; choice: string; reward: string; signature: string }

/** Torn-paper receipt: zigzag top edge drawn as an SVG path, slides up in 240ms when the answer lands. */
export function Receipt({ question, choice, reward, signature }: Props) {
  const reduce = useReducedMotion()
  const slide = useRef(new Animated.Value(0)).current
  const [width, setWidth] = useState(0)
  const { bind, ring } = useFocus()

  useEffect(() => {
    if (reduce) {
      slide.setValue(1)
      return
    }
    Animated.timing(slide, {
      toValue: 1,
      duration: motion.receipt,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [reduce, slide])

  const edge = tornEdge(width, signature)

  return (
    <Animated.View
      accessible
      accessibilityLabel={`Receipt. Counted. ${choice}. Reward ${reward}.`}
      style={{
        opacity: slide,
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={DEPTH + 1}>
          <Path d={`${edge} L${width} ${DEPTH + 1} L0 ${DEPTH + 1} Z`} fill={color.paper2} />
          <Path d={edge} fill="none" stroke={color.ink} strokeWidth={border.hair} strokeLinejoin="miter" />
        </Svg>
      ) : null}
      <View
        style={{
          backgroundColor: color.paper2,
          paddingHorizontal: space.lg,
          paddingTop: space.sm,
          paddingBottom: space.lg,
          gap: space.md,
          borderBottomWidth: border.hair,
          borderBottomColor: color.rule,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="label">Receipt</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Tick />
            <Text variant="label" style={{ color: color.ok }}>
              Counted
            </Text>
          </View>
        </View>
        <DashRule />
        <Line label="Poll">
          <Text variant="body" numberOfLines={3}>
            {question}
          </Text>
        </Line>
        <Line label="Choice">
          <Text variant="option">{choice}</Text>
        </Line>
        <DashRule />
        <Line label="Reward">
          <Text variant="questionLong" style={{ color: color.ok }}>
            +{reward}
          </Text>
        </Line>
        <Line label="Signature">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open this transaction in the explorer"
            onPress={() => Linking.openURL(explorerTx(signature))}
            hitSlop={8}
            {...bind}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 }, ring]}
          >
            <Text variant="count" style={{ textDecorationLine: 'underline' }}>
              {ellipsify(signature, 6, '..')}
            </Text>
            <Pointer />
          </Pressable>
        </Line>
      </View>
    </Animated.View>
  )
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Text variant="label" style={{ width: 88, paddingTop: 4, color: color.ink2 }}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  )
}
