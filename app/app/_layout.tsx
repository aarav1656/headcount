import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
  Newsreader_700Bold,
} from '@expo-google-fonts/newsreader'
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { color } from '@/constants/theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Newsreader_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  })

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync()
  }, [loaded, error])

  if (!loaded && !error) return null

  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="poll/[address]" />
        <Stack.Screen name="no-sgt" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </AppProviders>
  )
}
