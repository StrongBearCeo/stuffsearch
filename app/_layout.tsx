/** Root layout: initialize i18n, wire AuthProvider + HouseholdProvider + React Query. */
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider, useAuth } from '../src/lib/auth';
import { HouseholdProvider } from '../src/lib/household';
import { initI18n } from '../src/lib/i18n';
import { queryClient } from '../src/lib/offline';
import { QueryClientProvider } from '@tanstack/react-query';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  // expo-router redirects via the <Redirect /> component in index screens.
  // Here we only block rendering until we know whether there's a session.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({});

  useEffect(() => {
    (async () => {
      await initI18n();
      setReady(true);
      await SplashScreen.hideAsync().catch(() => {});
    })();
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HouseholdProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
              <StatusBar style="light" />
              <Gate>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </Gate>
            </SafeAreaView>
          </GestureHandlerRootView>
        </HouseholdProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
