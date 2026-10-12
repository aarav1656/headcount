import { Pressable, View } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { color, font, space } from '@/constants/theme'
import { Text } from '@/components/ui/text'

const LABELS: Record<string, string> = { index: 'Today', create: 'Create', me: 'Me' }

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: color.paper,
        borderTopWidth: 1,
        borderTopColor: color.rule,
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name)
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 56,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.xs,
              backgroundColor: pressed ? color.paperDeep : 'transparent',
            })}
          >
            <View
              style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: focused ? color.stamp : 'transparent' }}
            />
            <Text
              style={{
                fontFamily: focused ? font.bodySemi : font.bodyMedium,
                fontSize: 15,
                color: focused ? color.ink : color.inkSoft,
              }}
            >
              {LABELS[route.name] ?? route.name}
            </Text>
          </Pressable>
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
