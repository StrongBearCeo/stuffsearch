/** Items tab: searchable, tag-filterable list with a count + total-value summary. */
import React, { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, EmptyState, ErrorBanner, Button, H1, Muted, ListSkeleton } from '../../src/components/primitives';
import { ItemCard } from '../../src/components/ItemCard';
import { TagFilterBar } from '../../src/components/Tags';
import { useItems } from '../../src/hooks/useItems';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { collectTags, matchesTags } from '../../src/lib/tags';
import { summarizeValue, formatTotals } from '../../src/lib/value';
import { spacing, colors } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function ItemsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { columns } = useResponsive();
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { data, isLoading, error, refetch, isFetching } = useItems(q);
  const { data: places } = usePlaces();
  // Build an id → name map once so each card can show its exact location.
  const placeNameById = new Map((places ?? []).map((p) => [p.id, p.name]));

  // Tag chips come from the search-filtered set, so the bar only ever offers
  // tags that can actually narrow the list further.
  const searched = useMemo(() => data ?? [], [data]);
  const tagCounts = useMemo(() => collectTags(searched), [searched]);
  const visible = useMemo(
    () => searched.filter((i) => matchesTags(i.tags, selectedTags)),
    [searched, selectedTags],
  );

  // Count + total asset value of what's on screen.
  const summary = useMemo(() => summarizeValue(visible), [visible]);
  const totalsLabel = formatTotals(summary.totals);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 8 }}>
        <H1>{t('items.title')}</H1>
        <Input placeholder={t('items.searchPlaceholder')} value={q} onChangeText={setQ} />
        <Button title={t('items.new')} onPress={() => router.push('/item/new')} />
        <TagFilterBar
          tags={tagCounts}
          selected={selectedTags}
          onToggle={toggleTag}
          onClear={() => setSelectedTags([])}
        />
        {!isLoading ? (
          <Muted accessibilityRole="summary">
            {t('items.count', { count: visible.length })}
            {totalsLabel ? ` · ${t('items.totalValue')} ${totalsLabel}` : ''}
            {summary.unvalued > 0 ? ` · ${t('items.notValued', { count: summary.unvalued })}` : ''}
          </Muted>
        ) : null}
      </View>
      <FlatList
        data={visible}
        key={`cols-${columns}`}
        numColumns={columns}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns, padding: spacing.sm }}>
            <ItemCard
              item={item}
              placeName={item.current_place_id ? placeNameById.get(item.current_place_id) : null}
              onPress={() => router.push(`/item/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          error ? (
            <ErrorBanner message={(error as Error).message} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : (
            <EmptyState title={t('items.empty')} hint={t('items.emptyHint')} />
          )
        }
        contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textMuted} />}
      />
    </Screen>
  );
}
