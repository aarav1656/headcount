import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Tally } from '@/components/ui/tally'
import { color, space } from '@/constants/theme'
import { ellipsify } from '@/utils/ellipsify'

export default function NoSeekerToken() {
  const router = useRouter()
  const { wallet } = useLocalSearchParams<{ wallet?: string }>()
  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={{ gap: space.sm }}>
          <Button label="See open polls" onPress={() => router.dismissTo('/')} />
          <Button label="Create a poll instead" kind="secondary" onPress={() => router.dismissTo('/create')} />
        </View>
      }
    >
      <Tally count={5} height={28} stroke={4} />
      <View style={{ gap: space.md }}>
        <Text variant="display" style={{ fontSize: 36, lineHeight: 38 }}>
          Headcount counts phones, not wallets.
        </Text>
        <Text variant="body" style={{ color: color.inkSoft }}>
          This poll is for Seeker phones only.{' '}
          {wallet ? `The wallet ${ellipsify(wallet, 4, '...')}` : 'This wallet'} does not hold a Seeker Genesis Token,
          so it cannot answer this one.
        </Text>
      </View>

      <View style={{ gap: space.lg }}>
        <Block
          title="What is a Seeker Genesis Token?"
          body="The SGT is a non-transferable token that comes with every Solana Seeker phone. It is how Headcount knows an answer comes from a real device."
        />
        <Block
          title="Why phones?"
          body="Anyone can make a thousand wallets. Nobody can make a thousand Seekers. On a Seekers-only poll one SGT is one answer, so a tally means that many distinct phones."
        />
        <Block
          title="What you can still do"
          body="Answer every poll marked Open and earn the reward, create and fund your own, and read the results of polls you created. Connect the wallet that holds your SGT to answer Seekers-only polls."
        />
      </View>
    </Screen>
  )
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: space.xs, paddingLeft: space.md, borderLeftWidth: 3, borderLeftColor: color.stamp }}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="small">{body}</Text>
    </View>
  )
}
