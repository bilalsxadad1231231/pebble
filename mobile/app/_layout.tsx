import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Quicksand_600SemiBold,
  Quicksand_700Bold,
  useFonts,
} from '@expo-google-fonts/quicksand';

import { downloads } from '../src/download/manager';
import * as inbound from '../src/links/inbound';
import { useDeepLinkBridge } from '../src/links/useDeepLinkBridge';
import { useShareIntentBridge } from '../src/links/useShareIntentBridge';
import { colors } from '../src/theme/neumorphic';

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });

  useEffect(() => {
    void downloads.hydrate();
  }, []);

  useShareIntentBridge();
  useDeepLinkBridge();

  // A link can arrive while the user is on Library or Settings, so routing
  // lives here rather than on Home - Home only knows how to resolve one.
  useEffect(() => inbound.subscribe(() => router.navigate('/')), [router]);

  // Headings falling back to the system font is the fastest way for this design
  // to look off-brand, so the app does not render until Quicksand is in.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="download/[id]" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
