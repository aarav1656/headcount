import { type PropsWithChildren, type ReactNode } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { color, space } from '@/constants/theme'

type Props = PropsWithChildren<{
  refreshing?: boolean
  onRefresh?: () => void
  footer?: ReactNode
  edges?: ('top' | 'bottom')[]
}>

export function Screen({ children, refreshing, onRefresh, footer, edges = ['top'] }: Props) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.xl,
          paddingTop: space.lg,
          paddingBottom: space.huge,
          gap: space.xl,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={color.stamp}
              colors={[color.stamp]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: space.xl,
            paddingVertical: space.md,
            borderTopWidth: 1,
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

export function Rule() {
  return <View style={{ height: 1, backgroundColor: color.rule }} />
}
