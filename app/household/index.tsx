/** Household index: members list + invite QR + leave/transfer. */
import React from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, H2, Muted, Card, Button, ErrorBanner, MaxWidth } from '../../src/components/primitives';
import { InviteQR } from '../../src/components/InviteQR';
import { MemberRow } from '../../src/components/MemberRow';
import { useMembers, useUpdateMemberRole, useRemoveMember } from '../../src/hooks/useMembers';
import type { MemberWithProfile } from '../../src/hooks/useMembers';
import { useHousehold } from '../../src/lib/household';
import { colors, spacing } from '../../src/theme';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { useHeaderTitle } from '../../src/lib/useHeaderTitle';
import { hapticSuccess } from '../../src/lib/haptics';
import { useResponsive } from '../../src/hooks/useResponsive';

export default function HouseholdIndexScreen() {
  const { t } = useTranslation();
  const { activeHousehold, activeRole, memberships } = useHousehold();
  const { data: members, error } = useMembers();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const { isWide } = useResponsive();
  useHeaderTitle(activeHousehold?.name ?? t('household.title'));

  if (!activeHousehold) {
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <Muted>{t('household.createPrompt')}</Muted>
          <Button title={t('household.create')} onPress={() => router.push('/household/new')} />
        </View>
      </Screen>
    );
  }

  const isOwner = activeRole === 'owner';
  const inviteLink = `stuffsearch://invite/${activeHousehold.invite_token}`;

  async function copyInvite() {
    await Clipboard.setStringAsync(inviteLink);
    hapticSuccess();
    Alert.alert(t('household.linkCopied'), inviteLink);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
        <MaxWidth style={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        <H1>{activeHousehold.name}</H1>
        {error ? <ErrorBanner message={(error as Error).message} /> : null}

        <View style={isWide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : { gap: 12 }}>
          <Card style={{ gap: 8, flex: isWide ? 1 : undefined }}>
            <H2>{t('household.inviteTitle')}</H2>
            <Muted>{t('household.inviteHint')}</Muted>
            <InviteQR inviteToken={activeHousehold.invite_token} />
            <TouchableOpacity onPress={copyInvite}>
              <Text style={{ color: colors.primary, fontFamily: 'monospace', fontSize: 12 }}>{inviteLink}</Text>
            </TouchableOpacity>
            <Button title={t('household.invite')} variant="ghost" onPress={copyInvite} />
          </Card>

          <View style={{ gap: 8, flex: isWide ? 1 : undefined }}>
            <H2>{t('household.members')}</H2>
            {members?.map((m: MemberWithProfile) => (
              <MemberRow
                key={m.user_id}
                member={m}
                isOwner={isOwner}
                onTransfer={isOwner && m.role !== 'owner' ? () => updateRole.mutate({ householdId: activeHousehold.id, userId: m.user_id, role: 'owner' }) : undefined}
                onRemove={isOwner && m.role !== 'owner' ? () => removeMember.mutate({ householdId: activeHousehold.id, userId: m.user_id }) : undefined}
              />
            ))}
          </View>
        </View>

        {memberships.length > 1 ? (
          <Button title={t('household.switch')} variant="ghost" onPress={() => router.push('/household/switch')} />
        ) : null}
        </MaxWidth>
      </ScrollView>
    </Screen>
  );
}
