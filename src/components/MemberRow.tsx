/** MemberRow — one household member with role badge + owner actions. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card } from './primitives';
import { colors, radius } from '../theme';
import type { MemberWithProfile } from '../hooks/useMembers';
import { useTranslation } from 'react-i18next';

export function MemberRow({
  member,
  isOwner,
  onTransfer,
  onRemove,
}: {
  member: MemberWithProfile;
  isOwner: boolean;
  onTransfer?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.primary + '33',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: '700' }}>
          {(member.profiles?.display_name ?? '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>
          {member.profiles?.display_name ?? member.user_id.slice(0, 8)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {member.role === 'owner' ? t('household.owner') : t('household.member')}
        </Text>
      </View>
      {member.role !== 'owner' && isOwner ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {onTransfer ? (
            <TouchableOpacity
              onPress={onTransfer}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: radius.sm,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {t('household.transferOwnership')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {onRemove ? (
            <TouchableOpacity
              onPress={onRemove}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: radius.sm,
                backgroundColor: colors.danger + '22',
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 12 }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
