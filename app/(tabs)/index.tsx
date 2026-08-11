/** Home tab: switcher + quick actions + recent items + household gate. */
import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H1, Card, Body, Muted, Button } from '../../src/components/primitives';
import { HouseholdSwitcher } from '../../src/components/HouseholdSwitcher';
import { ItemCard } from '../../src/components/ItemCard';
import { useItems } from '../../src/hooks/useItems';
import { useHousehold } from '../../src/lib/household';
import { colors, spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { memberships, createHousehold } = useHousehold();

  // Household gate: no households yet → prompt to create one.
  if (memberships.length === 0) {
    return <NoHousehold />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <H1>{t('app.name')}</H1>
        <HouseholdSwitcher />
        <QuickActions />
        <RecentItems />
      </ScrollView>
    </Screen>
  );
}

function QuickActions() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionTile emoji="📷" label={t('tabs.scan')} onPress={() => router.push('/(tabs)/scan')} />
      <ActionTile emoji="➕" label={t('items.new')} onPress={() => router.push('/item/new')} />
      <ActionTile emoji="🔍" label={t('common.search')} onPress={() => router.push('/search')} />
      <ActionTile emoji="❓" label={t('search.ask')} onPress={() => router.push('/ask')} />
    </View>
  );
}

function ActionTile({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
      <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 14 }}>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      </Card>
    </TouchableOpacity>
  );
}

function RecentItems() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useItems();
  return (
    <View style={{ gap: 8 }}>
      <Body style={{ fontWeight: '700' }}>{t('items.title')}</Body>
      {isLoading ? (
        <Muted>{t('common.loading')}</Muted>
      ) : !data || data.length === 0 ? (
        <Card>
          <Muted>{t('items.empty')}</Muted>
        </Card>
      ) : (
        data.slice(0, 5).map((it: typeof data[number]) => (
          <ItemCard key={it.id} item={it} onPress={() => router.push(`/item/${it.id}`)} />
        ))
      )}
    </View>
  );
}

function NoHousehold() {
  const { t } = useTranslation();
  const router = useRouter();
  const { createHousehold } = useHousehold();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 40 }}>🏠</Text>
        <H1>{t('household.create')}</H1>
        <Muted style={{ textAlign: 'center' }}>{t('household.createPrompt')}</Muted>
        <Button title={t('household.create')} onPress={() => router.push('/household/new')} />
        <Button title={t('household.join')} variant="ghost" onPress={() => router.push('/(auth)/join')} />
      </View>
    </Screen>
  );
}
