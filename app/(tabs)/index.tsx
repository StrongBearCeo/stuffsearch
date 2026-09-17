/** Home tab: switcher + quick actions + at-a-glance stats + recent activity.
 *
 *  The old home showed five recent items and nothing else — no way to see the
 *  rest, and no reason to come back to it. It now answers the questions the
 *  other tabs can't: how much is here, what have I touched lately, where do
 *  things live, and what still needs attention. */
import React, { useMemo } from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H1, Card, Body, Muted, Button, MaxWidth } from '../../src/components/primitives';
import { HouseholdSwitcher } from '../../src/components/HouseholdSwitcher';
import { ItemCard } from '../../src/components/ItemCard';
import { useItems } from '../../src/hooks/useItems';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useHousehold } from '../../src/lib/household';
import { summarizeValue, formatTotals } from '../../src/lib/value';
import { collectTags } from '../../src/lib/tags';
import { itemQuantity } from '../../src/lib/quantity';
import type { Item } from '../../src/lib/supabase';
import { colors, radius, spacing, tint } from '../../src/theme';
import { useTranslation } from 'react-i18next';

/** How many recent items the home screen shows before "view all". */
const RECENT_LIMIT = 8;

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
        <MaxWidth style={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
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
          <Overview />
          <TopTags />
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
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
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
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
          {label}
        </Text>
      </Card>
    </TouchableOpacity>
  );
}

/**
 * The household at a glance: how much is catalogued, what it's worth, and the
 * two things worth chasing — items with no location and items with no value.
 * Both tiles are tappable, because a number you can't act on is just decor.
 */
function Overview() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: items } = useItems();
  const { data: places } = usePlaces();

  const stats = useMemo(() => {
    const list = items ?? [];
    const summary = summarizeValue(list);
    const units = list.reduce((n, i) => n + itemQuantity(i.quantity), 0);
    return {
      items: list.length,
      units,
      places: (places ?? []).length,
      totals: formatTotals(summary.totals),
      unvalued: summary.unvalued,
      unplaced: list.filter((i) => !i.current_place_id).length,
    };
  }, [items, places]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatTile
          value={String(stats.items)}
          label={t('items.title')}
          hint={stats.units > stats.items ? t('home.unitsHint', { count: stats.units }) : undefined}
          onPress={() => router.push('/(tabs)/items')}
        />
        <StatTile
          value={String(stats.places)}
          label={t('places.title')}
          onPress={() => router.push('/(tabs)/places')}
        />
        <StatTile
          value={stats.totals || '—'}
          label={t('items.totalValue')}
          onPress={() => router.push('/(tabs)/items')}
        />
      </View>

      {stats.unplaced > 0 || stats.unvalued > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {stats.unplaced > 0 ? (
            <NudgeTile
              label={t('home.unplaced', { count: stats.unplaced })}
              onPress={() => router.push('/(tabs)/items')}
            />
          ) : null}
          {stats.unvalued > 0 ? (
            <NudgeTile
              label={t('items.notValued', { count: stats.unvalued })}
              onPress={() => router.push('/(tabs)/items')}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function StatTile({
  value,
  label,
  hint,
  onPress,
}: {
  value: string;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
    >
      <Card style={{ gap: 2, paddingVertical: 12 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
          {value}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: colors.textMuted, fontSize: 10 }} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </Card>
    </TouchableOpacity>
  );
}

function NudgeTile({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={{
          backgroundColor: tint(colors.warning),
          borderRadius: radius.md,
          paddingVertical: 8,
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }} numberOfLines={2}>
          {label} ›
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** The household's most-used tags, as one-tap jumps into a filtered list. */
function TopTags() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: items } = useItems();
  const tags = useMemo(() => collectTags(items ?? []).slice(0, 6), [items]);
  if (tags.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Body style={{ fontWeight: '700' }}>{t('home.browseByTag')}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {tags.map(({ tag, count }) => (
          <TouchableOpacity
            key={tag}
            onPress={() => router.push('/(tabs)/items')}
            accessibilityRole="button"
            accessibilityLabel={`${tag}, ${count}`}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13 }}>
              {tag} · {count}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RecentItems({ columns = 1 }: { columns?: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useItems();
  const { data: places } = usePlaces();
  const placeNameById = useMemo(
    () => new Map((places ?? []).map((p) => [p.id, p.name])),
    [places],
  );
  const shown = (data ?? []).slice(0, RECENT_LIMIT);
  const more = (data?.length ?? 0) - shown.length;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body style={{ fontWeight: '700' }}>{t('home.recent')}</Body>
        {(data?.length ?? 0) > 0 ? (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/items')}
            accessibilityRole="button"
            accessibilityLabel={t('home.viewAll')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
              {t('home.viewAll')} ›
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <Muted>{t('common.loading')}</Muted>
      ) : shown.length === 0 ? (
        <Card>
          <Muted>{t('items.empty')}</Muted>
        </Card>
      ) : columns > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {shown.map((it: Item) => (
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
        <View style={{ gap: spacing.sm }}>
          {shown.map((it: Item) => (
            <ItemCard
              key={it.id}
              item={it}
              placeName={it.current_place_id ? placeNameById.get(it.current_place_id) : null}
              onPress={() => router.push(`/item/${it.id}`)}
            />
          ))}
        </View>
      )}

      {more > 0 ? (
        <Button
          title={t('home.viewAllCount', { count: more })}
          variant="ghost"
          onPress={() => router.push('/(tabs)/items')}
        />
      ) : null}
    </View>
  );
}

function NoHousehold() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontSize: 40 }}>🏠</Text>
        <H1>{t('household.create')}</H1>
        <Muted style={{ textAlign: 'center' }}>{t('household.createPrompt')}</Muted>
        <Button title={t('household.create')} onPress={() => router.push('/household/new')} />
        <Button title={t('household.join')} variant="ghost" onPress={() => router.push('/(auth)/join')} />
      </View>
    </Screen>
  );
}
