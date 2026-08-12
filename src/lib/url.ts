/**
 * Pure URL helpers for opening external links from the UI.
 *
 * Kept free of React/RN so the normalization logic is unit-testable. The
 * `react-native` `Linking` API is invoked by the caller.
 */

/** Does `value` look like a full URL with a scheme (http, https, etc.)? */
export function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value.trim());
}

/**
 * Normalize a user-entered link into something `Linking.openURL` can open.
 * Bare domains / paths (no scheme) are prefixed with `https://`. Empty or
 * whitespace-only input returns null.
 */
export function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return hasScheme(trimmed) ? trimmed : `https://${trimmed}`;
}
