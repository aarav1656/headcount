import { Pressable, View } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { border, color } from '@/constants/theme'
import { Text } from '@/components/ui/text'
import { useFocus } from '@/components/ui/focus'

const LABELS: Record<string, string> = { index: 'Today', create: 'Create', me: 'Me' }

/** Section index along the foot of the page: three mono labels between ink rules, the open one underlined in red. */
function Tab({
  label,
  focused,
  onPress,
  first,
}: {
  label: string
  focused: boolean
  onPress: () => void
  first: boolean
}) {
  const { bind, ring } = useFocus(-4)
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      {...bind}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 56,
          alignItems: 'center',
          justifyContent: 'center',
          borderLeftWidth: first ? 0 : border.hair,
          borderLeftColor: color.rule,
          backgroundColor: pressed ? color.paper2 : 'transparent',
        },
        ring,
      ]}
    >
      <Text variant="action" style={{ color: focused ? color.ink : color.ink3 }}>
        {label}
      </Text>
      <View
        style={{
          marginTop: 4,
          height: border.heavy,
          width: 28,
          backgroundColor: focused ? color.tally : 'transparent',
        }}
      />
    </Pressable>
  )
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: color.paper,
        borderTopWidth: border.hair,
        borderTopColor: color.rule,
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i
        return (
          <Tab
            key={route.key}
            first={i === 0}
            focused={focused}
            label={LABELS[route.name] ?? route.name}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name)
            }}
          />
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="me" />
    </Tabs>
  )
}
