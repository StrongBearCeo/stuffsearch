/** Home tab: switcher + quick actions + recent items + household gate. */
import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H1, Card, Body, Muted, Button, MaxWidth } from '../../src/components/primitives';
import { HouseholdSwitcher } from '../../src/components/HouseholdSwitcher';
import { ItemCard } from '../../src/components/ItemCard';
import { useItems } from '../../src/hooks/useItems';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useHousehold } from '../../src/lib/household';
import { colors, spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isWide } = useResponsive();
  const { memberships } = useHousehold();

  // Household gate: no households yet → prompt to create one.
  if (memberships.length === 0) {
    return <NoHousehold />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <H1>{t('app.name')}</H1>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
            >
              <Text style={{ fontSize: 22 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
          <HouseholdSwitcher />
          <QuickActions />
          <RecentItems columns={isWide ? 2 : 1} />
        </MaxWidth>
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
    <TouchableOpacity
      onPress={onPress}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 14 }}>
        <Text style={{ fontSize: 22 }} accessibilityLabel={undefined}>{emoji}</Text>
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      </Card>
    </TouchableOpacity>
  );
}

function RecentItems({ columns = 1 }: { columns?: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useItems();
  const { data: places } = usePlaces();
  const placeNameById = new Map((places ?? []).map((p) => [p.id, p.name]));
  return (
    <View style={{ gap: 8 }}>
      <Body style={{ fontWeight: '700' }}>{t('items.title')}</Body>
      {isLoading ? (
        <Muted>{t('common.loading')}</Muted>
      ) : !data || data.length === 0 ? (
        <Card>
          <Muted>{t('items.empty')}</Muted>
        </Card>
      ) : columns > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.slice(0, 6).map((it: typeof data[number]) => (
            <View key={it.id} style={{ width: '48%', flexGrow: 1 }}>
              <ItemCard
                item={it}
                placeName={it.current_place_id ? placeNameById.get(it.current_place_id) : null}
                onPress={() => router.push(`/item/${it.id}`)}
              />
            </View>
          ))}
        </View>
      ) : (
        data.slice(0, 5).map((it: typeof data[number]) => (
          <ItemCard
            key={it.id}
            item={it}
            placeName={it.current_place_id ? placeNameById.get(it.current_place_id) : null}
            onPress={() => router.push(`/item/${it.id}`)}
          />
        ))
      )}
    </View>
  );
}

function NoHousehold() {
  const { t } = useTranslation();
  const router = useRouter();
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
