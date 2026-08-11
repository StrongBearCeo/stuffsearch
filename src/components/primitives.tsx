/** Small primitive UI building blocks reused across screens. */
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  type ViewProps,
  type TextProps,
  type TextInputProps,
  type TouchableOpacityProps,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../theme';

export function Screen({ style, children }: { style?: ViewProps['style']; children: React.ReactNode }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
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

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={{
        backgroundColor: colors.surfaceAlt,
        color: colors.text,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        borderWidth: 1,
        borderColor: colors.border,
      }}
      {...props}
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
    <View style={{ backgroundColor: colors.danger + '22', padding: 10, borderRadius: radius.md }}>
      <Text style={{ color: colors.danger }}>
        {t('errors.generic')} {message}
      </Text>
    </View>
  );
}
