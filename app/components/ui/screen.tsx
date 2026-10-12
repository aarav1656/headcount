import { type PropsWithChildren, type ReactNode } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { border, color, space } from '@/constants/theme'
import { Masthead } from '@/components/masthead'

type Props = PropsWithChildren<{
  refreshing?: boolean
  onRefresh?: () => void
  footer?: ReactNode
  edges?: ('top' | 'bottom')[]
  back?: { label: string; onPress: () => void }
  wallet?: boolean
}>

/** Paper ground, masthead first, content in one column, optional pinned footer above the safe area. */
export function Screen({ children, refreshing, onRefresh, footer, edges = ['top'], back, wallet }: Props) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: space.xxl,
          gap: space.xl,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={color.tally}
              colors={[color.tally]}
            />
          ) : undefined
        }
      >
        <Masthead back={back} wallet={wallet} />
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            gap: space.sm,
            borderTopWidth: border.hair,
            borderTopColor: color.rule,
            backgroundColor: color.paper,
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  )
}

export function Rule({ heavy }: { heavy?: boolean }) {
  return <View style={{ height: heavy ? border.heavy : border.hair, backgroundColor: color.rule }} />
}

/** A rule that runs edge to edge, to sit over rows that bleed past the gutter. */
export function BleedRule() {
  return (
    <View style={{ marginHorizontal: -space.lg }}>
      <Rule />
    </View>
  )
}
