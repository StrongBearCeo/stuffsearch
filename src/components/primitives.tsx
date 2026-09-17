/** Small primitive UI building blocks reused across screens. */
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ViewProps,
  type TextProps,
  type TextInputProps,
  type TouchableOpacityProps,
  type ScrollViewProps,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, tint } from '../theme';
import { CONTENT_MAX_WIDTH } from '../hooks/useResponsive';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { keyboardSpacerHeight } from '../lib/keyboard';

export function Screen({ style, children }: { style?: ViewProps['style']; children: React.ReactNode }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

/** Centers children within CONTENT_MAX_WIDTH. Drop this directly inside a
 * ScrollView's content to cap detail/home/household screens in landscape so
 * their content doesn't stretch edge-to-edge across the wide viewport. */
export function MaxWidth({ children, style }: { children: React.ReactNode; style?: ViewProps['style'] }) {
  const { width } = useWindowDimensions();
  return (
    <View style={[{ width: Math.min(width, CONTENT_MAX_WIDTH), alignSelf: 'center' }, style]}>{children}</View>
  );
}

/** A keyboard-aware form container. Wraps a ScrollView in a KeyboardAvoidingView
 * so inputs (and the Save button beneath them) stay visible when the soft
 * keyboard opens. Use this in place of `<Screen><ScrollView>` on form screens.
 * Pass the same `contentContainerStyle` you'd give a ScrollView.
 *
 * Keyboard handling has three parts, because KeyboardAvoidingView alone was
 * not enough — the description / product-link / tag fields near the bottom of
 * the item and place forms stayed hidden under the keyboard on Android:
 *   1. `behavior="padding"` on iOS (the classic case).
 *   2. `automaticallyAdjustKeyboardInsets` so iOS scrolls the focused field up.
 *   3. A spacer equal to the keyboard's height appended to the content on
 *      every platform. Without extra scrollable room below the last field, no
 *      amount of avoiding can bring it above the keyboard; with it, both the
 *      platform auto-scroll and a manual swipe can reach every field.
 *
 * Content is capped to CONTENT_MAX_WIDTH and centered, so in landscape inputs
 * and buttons don't stretch across the full width. */
export function FormScreen({
  children,
  contentContainerStyle,
  style,
}: {
  children: React.ReactNode;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  style?: ViewProps['style'];
}) {
  // Cap content width in landscape. We compute the literal width here rather
  // than relying on maxWidth inside a ScrollView: in RN, a child with
  // width:'100%' inside a ScrollView resolves to the (unbounded) content
  // width, so maxWidth is never hit. A measured literal width works.
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const spacer = keyboardSpacerHeight(keyboardHeight, insets.bottom);
  return (
    <Screen style={style}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          {/* The caller's padding belongs INSIDE the width-capped view, not on
              the scroll content container. Applied outside it, a 16px padding
              plus a child measured at the full window width made the content
              32px wider than the screen: every field ran off the right edge
              and the form had no left/right margin at all. */}
          <View style={[{ width: contentWidth }, contentContainerStyle]}>{children}</View>
          {/* Scrollable room under the last field while the keyboard is up. */}
          <View style={{ height: spacer }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function Card({ style, children }: { style?: ViewProps['style']; children: React.ReactNode }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: TextProps['style'] }) {
  return (
    <Text style={[{ color: colors.text, fontSize: 26, fontWeight: '700' }, style]}>{children}</Text>
  );
}
export function H2({ children, style }: { children: React.ReactNode; style?: TextProps['style'] }) {
  return (
    <Text style={[{ color: colors.text, fontSize: 18, fontWeight: '600' }, style]}>{children}</Text>
  );
}
export function Body({ children, style, ...rest }: TextProps & { children: React.ReactNode }) {
  return (
    <Text style={[{ color: colors.text, fontSize: 15 }, style]} {...rest}>
      {children}
    </Text>
  );
}
export function Muted({ children, style, ...rest }: TextProps & { children: React.ReactNode }) {
  return (
    <Text style={[{ color: colors.textMuted, fontSize: 13 }, style]} {...rest}>
      {children}
    </Text>
  );
}

interface InputProps extends TextInputProps {
  /** Show an inline ✕ that empties the field. Needs `value` + `onChangeText`. */
  clearable?: boolean;
  /** Accessible label for the clear button. Defaults to the i18n string. */
  clearLabel?: string;
}

export function Input({ style, multiline, clearable, clearLabel, ...rest }: InputProps) {
  const { t } = useTranslation();
  const field = (
    <TextInput
      placeholderTextColor={colors.textMuted}
      // `multiline` MUST be forwarded. It used to be destructured here and used
      // only for styling, so every "multiline" field was really a single-line
      // input: the description box looked tall but never wrapped, and a long
      // description scrolled sideways past the edge instead.
      multiline={multiline}
      // Merge (not replace): caller `style` must augment the base, otherwise a
      // caller passing e.g. { minHeight: 80 } would clobber color/background/
      // border and the field would render as black text with no input chrome.
      // textAlignVertical:'top' keeps multiline text pinned to the top on
      // Android (it otherwise vertically centers, which reads as a bug).
      style={[
        {
          backgroundColor: colors.surfaceAlt,
          color: colors.text,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          borderWidth: 1,
          borderColor: colors.border,
        },
        multiline ? { minHeight: 80, textAlignVertical: 'top' } : null,
        // Leave room for the ✕ so text never slides under it.
        clearable ? { paddingRight: 40 } : null,
        style,
      ]}
      {...rest}
    />
  );

  if (!clearable) return field;

  const hasText = typeof rest.value === 'string' && rest.value.length > 0;
  return (
    <View style={{ position: 'relative', justifyContent: 'center' }}>
      {field}
      {hasText ? (
        <TouchableOpacity
          onPress={() => rest.onChangeText?.('')}
          accessibilityRole="button"
          accessibilityLabel={clearLabel ?? t('common.clear')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            position: 'absolute',
            right: 8,
            // Pin to the first line on a multiline field rather than floating
            // in the vertical middle of a tall box.
            ...(multiline ? { top: 8 } : {}),
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
}
export function Button({ title, variant = 'primary', loading, style, disabled, ...rest }: ButtonProps) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'ghost' ? colors.primary : '#fff';
  return (
    <TouchableOpacity
      disabled={disabled || loading}
      style={[
        {
          backgroundColor: bg,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          alignItems: 'center',
          opacity: disabled || loading ? 0.6 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * The small ✨ button that sits beside a single form field and asks the model
 * to fill in just that field. Deliberately compact — it has to fit on the
 * label row without pushing the label around.
 */
export function AiButton({
  onPress,
  loading,
  disabled,
  accessibilityLabel,
}: {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.sm,
        backgroundColor: tint(colors.primary, '22'),
        opacity: disabled || loading ? 0.5 : 1,
        minWidth: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={{ fontSize: 13 }}>✨</Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * A labelled form field. The label sits above the input so it stays visible
 * once the placeholder is gone, and an optional action (the per-field ✨
 * button) sits at the end of the label row.
 */
export function Field({
  label,
  action,
  hint,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Muted style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', flexShrink: 1 }}>
          {label}
        </Muted>
        {action}
      </View>
      {children}
      {hint ? <Muted style={{ fontSize: 11 }}>{hint}</Muted> : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <Body style={{ fontWeight: '600', marginBottom: 4 }}>{title}</Body>
      {hint ? <Muted style={{ textAlign: 'center' }}>{hint}</Muted> : null}
    </View>
  );
}

/** A row of placeholder cards shown while a list is loading, so the user
 * sees structure immediately instead of a blank screen that pops in.
 * `rows` controls how many placeholder rows to render (default 4). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 8, paddingTop: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: 0.6,
          }}
        >
          {/* thumbnail placeholder */}
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} />
          {/* two-line text placeholder */}
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 14, width: '55%', borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }} />
            <View style={{ height: 11, width: '35%', borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ backgroundColor: tint(colors.danger), padding: 10, borderRadius: radius.md }}>
      <Text style={{ color: colors.danger }}>
        {t('errors.generic')} {message}
      </Text>
    </View>
  );
}
