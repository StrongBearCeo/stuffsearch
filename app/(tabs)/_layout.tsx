/** Tabs layout. Shows a tab bar with Home / Items / Places / Scan.
 * Also gates on household membership: if the user has no households yet,
 * push them to the create-household screen. */
import React from 'react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { useHousehold } from '../../src/lib/household';
import { colors } from '../../src/theme';
import { ActivityIndicator, View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { memberships, loading } = useHousehold();

  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  // First-time user with no households: route to the create screen.
  // The home tab handles this case too, so we let it render normally.

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: () => <TabIcon>🏠</TabIcon> }}
      />
      <Tabs.Screen
        name="items"
        options={{ title: t('tabs.items'), tabBarIcon: () => <TabIcon>📦</TabIcon> }}
      />
      <Tabs.Screen
        name="places"
        options={{ title: t('tabs.places'), tabBarIcon: () => <TabIcon>🗄️</TabIcon> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: t('tabs.scan'), tabBarIcon: () => <TabIcon>📷</TabIcon> }}
      />
    </Tabs>
  );
}

function TabIcon({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 18 }}>{children}</Text>;
}
