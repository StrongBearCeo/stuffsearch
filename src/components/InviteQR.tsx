/** InviteQR — renders a QR for a household invite deep-link. */
import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { buildDeepLink } from '../lib/constants';
import { colors } from '../theme';

export function InviteQR({ inviteToken }: { inviteToken: string }) {
  const payload = buildDeepLink('invite', inviteToken);
  return (
    <View
      style={{
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        alignSelf: 'center',
      }}
    >
      <QRCode value={payload} size={200} backgroundColor="#fff" color={colors.bg} />
    </View>
  );
}
