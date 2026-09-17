/** Items tab: searchable, tag-filterable list with a count + total-value
 *  summary, and a selection mode for moving several items at once. */
import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Text, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen, Input, EmptyState, ErrorBanner, Button, H1, Muted, Body, Card, ListSkeleton,
} from '../../src/components/primitives';
import { ItemCard } from '../../src/components/ItemCard';
import { TagFilterBar } from '../../src/components/Tags';
import { useItems, useBulkMoveItems } from '../../src/hooks/useItems';
import { usePlaces } from '../../src/hooks/usePlaces';
import { useRecentPlaces } from '../../src/hooks/useRecentPlaces';
import { useResponsive } from '../../src/hooks/useResponsive';
import { collectTags, matchesTags } from '../../src/lib/tags';
import { summarizeValue, formatTotals } from '../../src/lib/value';
import { toggleSelected, selectAll, clearSelection, isAllSelected, selectedFrom } from '../../src/lib/selection';
import { orderByRecent } from '../../src/lib/recent';
import type { Item, Place } from '../../src/lib/supabase';
import { spacing, colors, radius, tint } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import { hapticSuccess } from '../../src/lib/haptics';

export default function ItemsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { columns } = useResponsive();
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [movePicker, setMovePicker] = useState(false);
  // `isRefetching` (a user-initiated refresh) NOT `isFetching`: every
  // background refetch flipped isFetching, which re-mounted the RefreshControl
  // mid-scroll and made the list jump and flicker — most visibly right after
  // editing an item and navigating back, which invalidates the query.
  const { data, isLoading, error, refetch, isRefetching } = useItems(q);
  const { data: places } = usePlaces();
  const { recent, remember } = useRecentPlaces();
  const bulkMove = useBulkMoveItems();

  // Build an id → name map once so each card can show its exact location.
  // Memoized: a new Map each render changes renderItem's identity and forces
  // every row to re-render.
  const placeNameById = useMemo(
    () => new Map((places ?? []).map((p) => [p.id, p.name])),
    [places],
  );

  // Tag chips come from the search-filtered set, so the bar only ever offers
  // tags that can actually narrow the list further.
  const searched = useMemo(() => data ?? [], [data]);
  const tagCounts = useMemo(() => collectTags(searched), [searched]);
  const visible = useMemo(
    () => searched.filter((i) => matchesTags(i.tags, selectedTags)),
    [searched, selectedTags],
  );
  const visibleIds = useMemo(() => visible.map((i) => i.id), [visible]);

  // Count + total asset value of what's on screen.
  const summary = useMemo(() => summarizeValue(visible), [visible]);
  const totalsLabel = formatTotals(summary.totals);

  const pickerPlaces = useMemo(
    () => orderByRecent(places ?? [], recent, (p: Place) => p.id),
    [places, recent],
  );

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  function exitSelection() {
    setSelecting(false);
    setSelected(clearSelection());
    setMovePicker(false);
  }

  const onRowPress = useCallback(
    (item: Item) => {
      if (selecting) setSelected((prev) => toggleSelected(prev, item.id));
      else router.push(`/item/${item.id}`);
    },
    [selecting, router],
  );

  /** Move every selected item into one place, then leave selection mode. */
  async function onBulkMove(placeId: string | null) {
    const ids = selectedFrom(visible, selected, (i) => i.id).map((i) => i.id);
    if (ids.length === 0) return;
    setMovePicker(false);
    try {
      const res = await bulkMove.mutateAsync({ itemIds: ids, placeId });
      remember(placeId);
      hapticSuccess();
      if (res.failed.length > 0) {
        Alert.alert(
          t('items.bulkMoveDone', { count: res.moved }),
          t('items.bulkMoveFailed', { count: res.failed.length }),
        );
      }
      exitSelection();
    } catch (e) {
      Alert.alert(t('errors.generic'), e instanceof Error ? e.message : undefined);
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      const isSelected = selected.has(item.id);
      return (
        <View style={{ flex: 1 / columns, padding: spacing.sm }}>
          <View style={{ position: 'relative' }}>
            <ItemCard
              item={item}
              placeName={item.current_place_id ? placeNameById.get(item.current_place_id) : null}
              onPress={() => onRowPress(item)}
            />
            {selecting ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primary : 'rgba(15,23,42,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isSelected ? (
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [columns, placeNameById, onRowPress, selecting, selected],
  );

  const keyExtractor = useCallback((i: Item) => i.id, []);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <H1>{t('items.title')}</H1>
          <TouchableOpacity
            onPress={() => (selecting ? exitSelection() : setSelecting(true))}
            accessibilityRole="button"
            accessibilityLabel={selecting ? t('common.cancel') : t('items.select')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              {selecting ? t('common.cancel') : t('items.select')}
            </Text>
          </TouchableOpacity>
        </View>

        <Input
          placeholder={t('items.searchPlaceholder')}
          value={q}
          onChangeText={setQ}
          clearable
          clearLabel={t('search.clearSearch')}
        />

        {!selecting ? (
          <Button title={t('items.new')} onPress={() => router.push('/item/new')} />
        ) : null}

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
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={
          error ? (
            <ErrorBanner message={(error as Error).message} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : (
            <EmptyState title={t('items.empty')} hint={t('items.emptyHint')} />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.sm,
          paddingBottom: selecting ? 160 : spacing.xl,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.textMuted} />
        }
      />

      {/* Selection action bar. Floats over the list so the selection stays
          visible while choosing a destination. */}
      {selecting ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.sm,
            right: spacing.sm,
            bottom: spacing.sm,
            gap: spacing.sm,
          }}
        >
          {movePicker ? (
            <Card style={{ maxHeight: 260, gap: 4 }}>
              <Muted style={{ fontSize: 11 }}>{t('items.moveTo')}</Muted>
              <FlatList
                data={[null, ...pickerPlaces]}
                keyExtractor={(p, i) => (p ? p.id : `none-${i}`)}
                renderItem={({ item: p }) => (
                  <TouchableOpacity
                    onPress={() => onBulkMove(p ? p.id : null)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radius.sm,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ color: colors.text }} numberOfLines={2}>
                      {p ? p.name : t('items.notLocated')}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </Card>
          ) : null}

          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Body style={{ flex: 1, fontWeight: '600' }}>
                {t('items.selectedCount', { count: selected.size })}
              </Body>
              <TouchableOpacity
                onPress={() =>
                  setSelected(
                    isAllSelected(visibleIds, selected) ? clearSelection() : selectAll(visibleIds),
                  )
                }
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.primary, fontSize: 13 }}>
                  {isAllSelected(visibleIds, selected) ? t('print.selectNone') : t('print.selectAll')}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={movePicker ? t('common.cancel') : t('items.moveSelected')}
                  onPress={() => setMovePicker(!movePicker)}
                  disabled={selected.size === 0}
                  loading={bulkMove.isPending}
                />
              </View>
            </View>
          </Card>
        </View>
      ) : null}

      {/* A tinted strip makes selection mode obvious at a glance. */}
      {selecting ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: tint(colors.primary, '66'),
          }}
        />
      ) : null}
    </Screen>
  );
}
