import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { border, color, space } from '@/constants/theme'
import { ACTIVE_CLUSTER } from '@/constants/headcount'
import { ellipsify } from '@/utils/ellipsify'
import { Text } from '@/components/ui/text'
import { Pointer } from '@/components/ui/glyphs'
import { useFocus } from '@/components/ui/focus'
import { describeError } from '@/lib/headcount/errors'
import { forgetSession } from '@/lib/headcount/session'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

/** The wallet line: cluster and address on the left, connect or disconnect on the right. */
export function WalletChip() {
  const { account, connect, disconnect } = useHeadcountWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { bind, ring } = useFocus()

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (account) {
        forgetSession(account.address)
        await disconnect()
      } else {
        await connect()
      }
    } catch (e) {
      const d = describeError(e)
      if (!d.cancelled) setError(d.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ borderBottomWidth: border.hair, borderBottomColor: color.rule }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="label" style={{ color: color.ink2, flexShrink: 1 }} numberOfLines={1}>
          {ACTIVE_CLUSTER.key} · {account ? ellipsify(account.address, 4, '..') : 'no wallet'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={account ? `Wallet ${account.address}. Disconnect` : 'Connect wallet'}
          onPress={toggle}
          disabled={busy}
          {...bind}
          style={({ pressed }) => [
            {
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingLeft: space.md,
              backgroundColor: pressed ? color.paper2 : 'transparent',
            },
            ring,
          ]}
        >
          <Text variant="label" style={{ color: busy ? color.ink3 : color.ink }}>
            {busy ? 'waiting' : account ? 'disconnect' : 'connect'}
          </Text>
          {account || busy ? null : <Pointer />}
        </Pressable>
      </View>
      {error ? (
        <Text variant="fine" style={{ color: color.warn, paddingBottom: space.sm }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
