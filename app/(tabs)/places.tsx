/** Places tab: searchable, tag-filterable, with a flat list and a tree view.
 *
 *  The flat list answers "where is X?"; the tree answers "what's in the
 *  garage?" — the nesting is already in the data (`parent_place_id`) and the
 *  list threw it away. Searching switches back to the flat list, because a
 *  filtered tree with missing parents reads as broken. */
import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Input, EmptyState, ErrorBanner, Button, H1, Muted, ListSkeleton } from '../../src/components/primitives';
import { PlaceCard } from '../../src/components/PlaceCard';
import { PhotoThumb } from '../../src/components/PhotoThumb';
import { placePhotos } from '../../src/lib/photos';
import { TagFilterBar } from '../../src/components/Tags';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { collectTags, matchesTags } from '../../src/lib/tags';
import { buildPlaceTree, flattenPlaceTree, type PlaceTreeRow } from '../../src/lib/placeTree';
import type { Place } from '../../src/lib/supabase';
import { spacing, colors, radius, tint } from '../../src/theme';
import { useTranslation } from 'react-i18next';

type ViewMode = 'list' | 'tree';

export default function PlacesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { columns } = useResponsive();
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<ViewMode>('list');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // See items.tsx: isRefetching, not isFetching — a background refetch must
  // not animate the pull-to-refresh control and shift the list under the user.
  const { data, isLoading, error, refetch, isRefetching } = usePlaces(q);

  // Build an id → name map so each card can show its parent place (location).
  const parentNameById = useMemo(
    () => new Map((data ?? []).map((p) => [p.id, p.name])),
    [data],
  );

  const searched = useMemo(() => data ?? [], [data]);
  const tagCounts = useMemo(() => collectTags(searched), [searched]);
  const visible = useMemo(
    () => searched.filter((p) => matchesTags(p.tags, selectedTags)),
    [searched, selectedTags],
  );

  // A search or tag filter hides parents, which would leave the tree full of
  // orphans — fall back to the flat list while either is active.
  const filtering = q.trim().length > 0 || selectedTags.length > 0;
  const showTree = mode === 'tree' && !filtering;

  const treeRows = useMemo(
    () => (showTree ? flattenPlaceTree(buildPlaceTree(visible), collapsed) : []),
    [showTree, visible, collapsed],
  );

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <H1>{t('places.title')}</H1>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <ModeButton
              label={t('places.viewList')}
              active={mode === 'list'}
              onPress={() => setMode('list')}
            />
            <ModeButton
              label={t('places.viewTree')}
              active={mode === 'tree'}
              onPress={() => setMode('tree')}
            />
          </View>
        </View>

        <Input
          placeholder={t('places.searchPlaceholder')}
          value={q}
          onChangeText={setQ}
          clearable
          clearLabel={t('search.clearSearch')}
        />
        <Button title={t('places.new')} onPress={() => router.push('/place/new')} />
        <TagFilterBar
          tags={tagCounts}
          selected={selectedTags}
          onToggle={toggleTag}
          onClear={() => setSelectedTags([])}
        />
        {!isLoading ? (
          <Muted accessibilityRole="summary">
            {t('places.count', { count: visible.length })}
            {mode === 'tree' && filtering ? ` · ${t('places.treeFiltered')}` : ''}
          </Muted>
        ) : null}
      </View>

      {showTree ? (
        <FlatList
          data={treeRows}
          keyExtractor={(r) => r.place.id}
          renderItem={({ item: row }) => (
            <PlaceTreeItem
              row={row}
              collapsed={collapsed.has(row.place.id)}
              onPress={() => router.push(`/place/${row.place.id}`)}
              onToggle={() => toggleCollapsed(row.place.id)}
            />
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
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.textMuted} />
          }
        />
      ) : (
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
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.textMuted} />
          }
        />
      )}
    </Screen>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.sm,
        backgroundColor: active ? tint(colors.primary, '33') : colors.surfaceAlt,
      }}
    >
      <Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** One row of the hierarchy: indented by depth, with a collapse chevron when
 *  it has children and a count of everything nested below it. */
function PlaceTreeItem({
  row,
  collapsed,
  onPress,
  onToggle,
}: {
  row: PlaceTreeRow<Place>;
  collapsed: boolean;
  onPress: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { place, depth, hasChildren, descendantCount } = row;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingLeft: depth * 18,
        paddingVertical: 6,
      }}
    >
      {/* The chevron is its own tap target so expanding doesn't navigate. */}
      {hasChildren ? (
        <TouchableOpacity
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? t('places.expand') : t('places.collapse')}
          accessibilityState={{ expanded: !collapsed }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ width: 22, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{collapsed ? '▸' : '▾'}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 22, alignItems: 'center' }}>
          <Text style={{ color: colors.border, fontSize: 13 }}>·</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={place.name}
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.sm,
        }}
      >
        <PhotoThumb photos={placePhotos(place)} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {place.name}
          </Text>
          {descendantCount > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {t('places.count', { count: descendantCount })}
            </Text>
          ) : null}
        </View>
        {place.item_id ? (
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>📦</Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}
