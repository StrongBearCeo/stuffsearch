/** TutorialOverlay — a multi-step first-launch walkthrough shown as a modal.
 *  Covers: welcome → scan → organize → ask → print. Dismissed with "Skip" or
 *  "Get started" (on the last step). The caller owns the AsyncStorage
 *  "has seen" flag; this component just reports completion via onFinish. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';
import { useTranslation } from 'react-i18next';

export interface TutorialOverlayProps {
  visible: boolean;
  /** Called when the user finishes or skips the tutorial. */
  onFinish: () => void;
}

const STEPS = [
  { emoji: '🏠', titleKey: 'tutorial.stepWelcome', bodyKey: 'tutorial.stepWelcomeBody' },
  { emoji: '📷', titleKey: 'tutorial.stepScan', bodyKey: 'tutorial.stepScanBody' },
  { emoji: '🗄️', titleKey: 'tutorial.stepOrganize', bodyKey: 'tutorial.stepOrganizeBody' },
  { emoji: '❓', titleKey: 'tutorial.stepAsk', bodyKey: 'tutorial.stepAskBody' },
  { emoji: '🖨️', titleKey: 'tutorial.stepPrint', bodyKey: 'tutorial.stepPrintBody' },
] as const;

export function TutorialOverlay({ visible, onFinish }: TutorialOverlayProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      onFinish();
      setStep(0);
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    onFinish();
    setStep(0);
  }

  const current = STEPS[step];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: 16, maxHeight: '80%' }}>
          {/* Step emoji + content */}
          <ScrollView>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 56 }}>{current.emoji}</Text>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
                {t(current.titleKey)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
                {t(current.bodyKey)}
              </Text>
            </View>
          </ScrollView>

          {/* Progress dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === step ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === step ? colors.primary : colors.surfaceAlt,
                }}
              />
            ))}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            {!isLast ? (
              <TouchableOpacity onPress={handleSkip} style={{ padding: 12 }} hitSlop={{ top: 10, bottom: 10 }}>
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{t('tutorial.skip')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleNext}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: radius.md,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {isLast ? t('tutorial.getStarted') : t('tutorial.next')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
