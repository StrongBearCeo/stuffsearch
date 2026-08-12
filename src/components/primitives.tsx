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
import { colors, radius, tint } from '../theme';
import { CONTENT_MAX_WIDTH } from '../hooks/useResponsive';

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
  return (
    <Screen style={style}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        // On Android, the window resize mode handles most cases; this keeps
        // the content scrollable when the keyboard would otherwise cover it.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={[{ alignItems: 'center' }, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: contentWidth }}>{children}</View>
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

export function Input({ style, multiline, ...rest }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
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
        style,
      ]}
      {...rest}
    />
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
