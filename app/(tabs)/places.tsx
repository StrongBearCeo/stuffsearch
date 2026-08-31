/** Places tab: searchable, tag-filterable list with a count. */
import React, { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, EmptyState, ErrorBanner, Button, H1, Muted, ListSkeleton } from '../../src/components/primitives';
import { PlaceCard } from '../../src/components/PlaceCard';
import { TagFilterBar } from '../../src/components/Tags';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { collectTags, matchesTags } from '../../src/lib/tags';
import { spacing, colors } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function PlacesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { columns } = useResponsive();
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { data, isLoading, error, refetch, isFetching } = usePlaces(q);
  // Build an id → name map so each card can show its parent place (location).
  const parentNameById = new Map((data ?? []).map((p) => [p.id, p.name]));

  const searched = useMemo(() => data ?? [], [data]);
  const tagCounts = useMemo(() => collectTags(searched), [searched]);
  const visible = useMemo(
    () => searched.filter((p) => matchesTags(p.tags, selectedTags)),
    [searched, selectedTags],
  );

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: 8 }}>
        <H1>{t('places.title')}</H1>
        <Input placeholder={t('places.searchPlaceholder')} value={q} onChangeText={setQ} />
        <Button title={t('places.new')} onPress={() => router.push('/place/new')} />
        <TagFilterBar
          tags={tagCounts}
          selected={selectedTags}
          onToggle={toggleTag}
          onClear={() => setSelectedTags([])}
        />
        {!isLoading ? <Muted accessibilityRole="summary">{t('places.count', { count: visible.length })}</Muted> : null}
      </View>
      <FlatList
        data={visible}
        key={`cols-${columns}`}
        numColumns={columns}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns, padding: spacing.sm }}>
            <PlaceCard
              place={item}
              parentName={item.parent_place_id ? parentNameById.get(item.parent_place_id) : null}
              onPress={() => router.push(`/place/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          error ? (
            <ErrorBanner message={(error as Error).message} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : (
            <EmptyState title={t('places.empty')} hint={t('places.emptyHint')} />
          )
        }
        contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textMuted} />}
      />
    </Screen>
  );
}
