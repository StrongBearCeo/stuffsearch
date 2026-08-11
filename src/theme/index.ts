/** Shared theme tokens + small helpers used across components. */
import { clsx } from 'clsx';
export { clsx as cn };

export const colors = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#334155',
  border: '#475569',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  primary: '#6366f1',
  primaryMuted: '#4f46e5',
  accent: '#22d3ee',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
} as const;

export const radius = { sm: 6, md: 10, mdLg: 12, lg: 16, xl: 24 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/**
 * Produce a translucent variant of a 6-digit hex color by appending an alpha
 * hex pair. Centralizes the fragile `colors.x + '22'` pattern so tints are
 * typed and discoverable. `alpha` is a hex string like '22', '33', '44'.
 */
export function tint(hex: string, alpha: '22' | '33' | '44' | '66' = '22'): string {
  return hex + alpha;
}

/** Tailwind/NativeWind breakpoint helpers (tablet ≥ 768). */
export const tabletBreakpoint = 768;

/**
 * Shared react-navigation header options for the dark theme. Applied per-screen
 * via Stack.Screen options={{ ...headerTheme, title }} so detail/edit/modal
 * screens get a real platform back button while tab/auth screens stay headerless.
 */
export const headerTheme = {
  headerShown: true,
  headerTintColor: colors.text,
  headerStyle: {
    backgroundColor: colors.surface,
  },
  headerTitleStyle: {
    color: colors.text,
    fontWeight: '600' as const,
  },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
} as const;
