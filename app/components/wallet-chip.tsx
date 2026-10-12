import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { color, font, radius } from '@/constants/theme'
import { ellipsify } from '@/utils/ellipsify'
import { Text } from '@/components/ui/text'
import { describeError } from '@/lib/headcount/errors'
import { forgetSession } from '@/lib/headcount/session'
import { useHeadcountWallet } from '@/features/headcount/use-headcount-wallet'

/** Connect when signed out, wallet address when signed in. Tap the address to disconnect. */
export function WalletChip() {
  const { account, connect, disconnect } = useHeadcountWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <View style={{ alignItems: 'flex-end', gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={account ? `Wallet ${account.address}. Tap to disconnect` : 'Connect wallet'}
        onPress={toggle}
        disabled={busy}
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: 14,
          justifyContent: 'center',
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: color.ink,
          backgroundColor: pressed ? color.paperDeep : 'transparent',
          opacity: busy ? 0.5 : 1,
        })}
      >
        <Text style={{ fontFamily: account ? font.monoMedium : font.bodySemi, fontSize: 14, color: color.ink }}>
          {account ? ellipsify(account.address, 4, '...') : 'Connect'}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="monoSmall" style={{ color: color.danger, maxWidth: 220, textAlign: 'right' }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
