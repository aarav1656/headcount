import { Pressable, View } from 'react-native'
import { border, color, space } from '@/constants/theme'
import { Text } from '@/components/ui/text'
import { BackPointer } from '@/components/ui/glyphs'
import { useFocus } from '@/components/ui/focus'
import { WalletChip } from '@/components/wallet-chip'
import { useMyAnswers } from '@/features/headcount/queries'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

const dateline = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()

export function DoubleRule() {
  return (
    <View aria-hidden>
      <View style={{ height: border.doubleTop, backgroundColor: color.rule }} />
      <View style={{ height: border.doubleGap }} />
      <View style={{ height: border.doubleBottom, backgroundColor: color.rule }} />
    </View>
  )
}

type Props = { back?: { label: string; onPress: () => void }; wallet?: boolean }

/**
 * Every screen opens with this: wordmark left, date and issue number right, double rule under.
 * The issue number is the count of polls this wallet has answered, plus one.
 */
export function Masthead({ back, wallet }: Props) {
  const { account } = useHeadcountWallet()
  const mine = useMyAnswers(account?.address)
  const issue = (mine.data?.answers.length ?? 0) + 1
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="masthead" accessibilityRole="header">
          Headcount
        </Text>
        <Text variant="label" style={{ color: color.ink2 }}>
          {dateline()} · №{issue}
        </Text>
      </View>
      <DoubleRule />
      {back ? <BackRow {...back} /> : null}
      {wallet ? <WalletChip /> : null}
    </View>
  )
}

function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { bind, ring } = useFocus()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      onPress={onPress}
      hitSlop={8}
      {...bind}
      style={({ pressed }) => [
        {
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          alignSelf: 'flex-start',
          paddingRight: space.md,
          backgroundColor: pressed ? color.paper2 : 'transparent',
        },
        ring,
      ]}
    >
      <BackPointer />
      <Text variant="label">{label}</Text>
    </Pressable>
  )
}
