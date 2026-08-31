/**
 * Tag UI: chips, an editor for the item/place forms, and a filter bar for the
 * list screens. All tag normalization lives in `src/lib/tags.ts` — these
 * components only render and delegate.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Muted } from './primitives';
import { addTag, removeTag, type TagCount } from '../lib/tags';
import { colors, radius, spacing, tint } from '../theme';

/** A single tag chip. Selected chips invert to the primary colour. */
export function TagChip({
  tag,
  selected,
  count,
  onPress,
  onRemove,
  removeLabel,
}: {
  tag: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? tint(colors.primary, '33') : colors.surfaceAlt,
      }}
    >
      <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 13 }}>
        {tag}
        {count != null ? ` · ${count}` : ''}
      </Text>
      {onRemove ? (
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${removeLabel ?? 'Remove'} ${tag}`}
        >
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tag}
      accessibilityState={{ selected: !!selected }}
    >
      {body}
    </TouchableOpacity>
  );
}

/** Read-only wrap of chips, e.g. on a detail screen. */
export function TagList({ tags }: { tags: string[] | null | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} />
      ))}
    </View>
  );
}

/**
 * Tag editor for the create/edit forms: chips with a remove button plus an
 * input that commits on submit, on blur, or via the Add button. A comma in the
 * input adds several tags at once.
 */
export function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  /** Tags already used elsewhere in the household, offered as one-tap adds. */
  suggestions?: string[];
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  function commit() {
    if (!draft.trim()) return;
    onChange(addTag(tags, draft));
    setDraft('');
  }

  const unused = suggestions.filter((s) => !tags.includes(s)).slice(0, 8);

  return (
    <View style={{ gap: spacing.sm }}>
      {tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {tags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              removeLabel={t('tags.remove')}
              onRemove={() => onChange(removeTag(tags, tag))}
            />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          onBlur={commit}
          blurOnSubmit={false}
          returnKeyType="done"
          autoCapitalize="none"
          placeholder={t('tags.placeholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('tags.add')}
          style={{
            flex: 1,
            backgroundColor: colors.surfaceAlt,
            color: colors.text,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        <TouchableOpacity
          onPress={commit}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('tags.add')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: tint(colors.primary, '33'),
            opacity: draft.trim() ? 1 : 0.5,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('tags.add')}</Text>
        </TouchableOpacity>
      </View>

      {unused.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Muted style={{ fontSize: 11 }}>{t('tags.suggestions')}</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {unused.map((tag) => (
              <TagChip key={tag} tag={tag} onPress={() => onChange(addTag(tags, tag))} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Horizontal filter bar for the list screens. Tapping a tag toggles it;
 * selected tags combine with AND (see `matchesTags`).
 */
export function TagFilterBar({
  tags,
  selected,
  onToggle,
  onClear,
}: {
  tags: TagCount[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  if (tags.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, alignItems: 'center', paddingRight: spacing.lg }}
    >
      {selected.length > 0 ? (
        <TouchableOpacity onPress={onClear} accessibilityRole="button" accessibilityLabel={t('tags.clear')}>
          <Text style={{ color: colors.primary, fontSize: 13, paddingHorizontal: 4 }}>
            {t('tags.clear')}
          </Text>
        </TouchableOpacity>
      ) : null}
      {tags.map(({ tag, count }) => (
        <TagChip
          key={tag}
          tag={tag}
          count={count}
          selected={selected.includes(tag)}
          onPress={() => onToggle(tag)}
        />
      ))}
    </ScrollView>
  );
}
