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

export const radius = { sm: 6, md: 10, lg: 16, xl: 24 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Tailwind/NativeWind breakpoint helpers (tablet ≥ 768). */
export const tabletBreakpoint = 768;
