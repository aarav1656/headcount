import { useState } from 'react'
import { View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Problem } from '@/components/ui/stamp'
import { MeRecord } from '@/components/me-record'
import { UNIT } from '@/utils/skr'
import { color, space } from '@/constants/theme'
import { describeError } from '@/lib/headcount/errors'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

export default function Me() {
  const { account, connect } = useHeadcountWallet()
  const [error, setError] = useState<string | null>(null)

  if (!account) {
    return (
      <Screen wallet>
        <View style={{ gap: space.lg }}>
          <Text variant="question">Your record is kept by wallet.</Text>
          <Text variant="body" style={{ color: color.ink2 }}>
            Connect a wallet to read the ballots it has answered, the {UNIT} it has earned and its streak, straight from
            the chain.
          </Text>
          {error ? <Problem>{error}</Problem> : null}
          <Button
            label="Connect wallet"
            onPress={() =>
              connect().catch((e) => {
                const d = describeError(e)
                if (!d.cancelled) setError(d.message)
              })
            }
          />
        </View>
      </Screen>
    )
  }
  return <MeRecord address={account.address} />
}
