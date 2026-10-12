import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { TallyMarks } from '@/components/ui/tally'
import { border, color, space } from '@/constants/theme'
import { ellipsify } from '@/utils/ellipsify'

/** Tier 0 on a Seekers-only ballot: a printed notice in a double-ruled frame, not an error dialog. */
export default function NoSeekerToken() {
  const router = useRouter()
  const { wallet } = useLocalSearchParams<{ wallet?: string }>()
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ borderWidth: border.heavy, borderColor: color.rule, padding: 3 }}>
        <View style={{ borderWidth: border.hair, borderColor: color.rule, padding: space.lg, gap: space.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" style={{ color: color.tally }}>
              Notice to the voter
            </Text>
            <TallyMarks count={5} height={18} tint={color.ink} slash={color.tally} />
          </View>
          <Text variant="question" accessibilityRole="header">
            This ballot counts phones, not wallets.
          </Text>
          <Text variant="body">
            A Seeker Genesis Token is the non-transferable token that ships with every Solana Seeker phone, and it is
            how Headcount knows an answer comes from a real device. Anyone can make a thousand wallets but nobody can
            make a thousand Seekers, so on this ballot one token is one answer.
          </Text>
          <Text variant="fine">
            {wallet ? `Wallet ${ellipsify(wallet, 4, '..')}` : 'This wallet'} holds no Seeker token. Connect the one
            that does, or answer the ballots open to every wallet.
          </Text>
          <Button label="See open polls" onPress={() => router.dismissTo('/')} />
        </View>
      </View>
    </Screen>
  )
}
