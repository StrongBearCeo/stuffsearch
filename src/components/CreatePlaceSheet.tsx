/** CreatePlaceSheet — bottom sheet with the place-creation form (name +
 *  description + the scanned code shown read-only). Used by the item-detail
 *  "scan to set location" flow when an unknown code is scanned: the parent
 *  decides what to do with the submitted values (typically create the place,
 *  bind the code, then move the item into it).
 *
 *  Kept presentational: it owns only the form field state and hands the
 *  submitted { name, description } up via onCreate. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Input, H2, Muted, ErrorBanner } from './primitives';
import { colors, radius, spacing } from '../theme';
import { useTranslation } from 'react-i18next';

export interface CreatePlaceSheetProps {
  visible: boolean;
  /** The scanned code to bind to the new place (shown read-only). */
  codeValue: string;
  /** Optional initial name (e.g. derived from a product lookup). */
  initialName?: string;
  /** Async create handler. Resolves on success, throws on error. The sheet
   *  shows a loading state while pending and surfaces thrown errors. */
  onCreate: (values: { name: string; description: string }) => Promise<void>;
  onClose: () => void;
}

export function CreatePlaceSheet({
  visible,
  codeValue,
  initialName,
  onCreate,
  onClose,
}: CreatePlaceSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset fields each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setName(initialName ?? '');
      setDescription('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible, initialName]);

  async function submit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), description: description.trim() });
      // Parent closes on success; nothing to do here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: spacing.lg,
            gap: 12,
            maxHeight: '85%',
          }}
        >
          <H2>{t('items.createPlacePrompt')}</H2>

          {codeValue ? (
            <View style={{ backgroundColor: colors.surface, padding: 10, borderRadius: radius.md }}>
              <Muted>{t('codes.value')}</Muted>
              <Text style={{ color: '#fff', fontFamily: 'monospace' }}>{codeValue}</Text>
            </View>
          ) : null}

          <Input placeholder={t('places.name')} value={name} onChangeText={setName} />
          <Input
            placeholder={t('places.description')}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {error ? <ErrorBanner message={error} /> : null}

          <Button
            title={t('items.createAndAssign')}
            onPress={submit}
            loading={submitting}
            disabled={name.trim().length === 0}
          />
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', padding: 8 }} disabled={submitting}>
            <Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
