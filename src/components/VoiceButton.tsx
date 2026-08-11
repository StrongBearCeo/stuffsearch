/** VoiceButton — tap to start/stop voice input. Reused on search + notes. */
import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { useVoice } from '../hooks/useVoice';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../lib/supabase';

export function VoiceButton({
  language,
  onResult,
}: {
  language: SupportedLanguage;
  onResult: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { listening, start, stop } = useVoice(language);
  return (
    <View style={{ gap: 4 }}>
      <TouchableOpacity
        onPress={() => (listening ? stop() : start(onResult))}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: radius.md,
          backgroundColor: listening ? colors.danger : colors.primary,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
          {listening ? '■' : '🎤'}
        </Text>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
          {listening ? t('search.listening') : t('search.voice')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
