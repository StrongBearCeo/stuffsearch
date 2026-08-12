/**
 * AuthProvider — Supabase email auth (magic link + password).
 * Exposes session, user, profile, and sign-in / sign-up / sign-out helpers.
 *
 * Email/magic-link deep links are handled HERE at the root, not in the
 * `/confirm` route, because Supabase canonicalizes the redirect:
 * `stuffsearch:///confirm` (path form, what we send) comes back as
 * `stuffsearch://confirm?code=…` (host form), which expo-router does not
 * reliably route to `/confirm`. Capturing via Linking.getInitialURL + the
 * `url` event at the root works for both forms.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase, type Profile } from './supabase';

/**
 * Where Supabase email/magic-link redirects should land. Auto-adapts to the
 * runtime: `exp://<devhost>/--/confirm` in Expo Go, `stuffsearch:///confirm`
 * in a standalone/dev-client build. The root Linking handler exchanges the
 * PKCE code for a session.
 */
const redirectTo = Linking.createURL('/confirm');
// TEMP DEBUG: confirm the exact emailRedirectTo we send to Supabase.
// Remove once the end-to-end flow is verified.
console.log('[auth] emailRedirectTo =', redirectTo);

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Error from the last deep-link code exchange, if it failed. */
  linkError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Bootstrap session, then subscribe to auth changes.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    })();

    // Handle Supabase email/magic-link deep links at the root, independent of
    // expo-router path matching (see file header for the slash-canonicalization
    // rationale). The link may arrive as `stuffsearch:///confirm?code=…`
    // (path form) or `stuffsearch://confirm?code=…` (host form); either way
    // exchangeCodeForSession parses the `code` query param.
    const handleAuthLink = (raw: string | null) => {
      if (!raw) return;
      // TEMP DEBUG: see the exact incoming deep link + exchange result.
      // Remove once the end-to-end flow is verified.
      console.log('[auth] deep link =', raw);
      // Only act on Supabase auth redirects (PKCE `code` or implicit/error params).
      if (!/[?&](code|error|error_code|error_description|access_token)=/.test(raw)) return;
      supabase.auth
        .exchangeCodeForSession(raw)
        .then(({ data, error }) => {
          console.log('[auth] exchange =', { error: error?.message, hasSession: !!data?.session });
          if (error) {
            setLinkError(error.message);
            router.replace('/(auth)/confirm');
            return;
          }
          router.replace('/');
        })
        .catch((e) => {
          console.log('[auth] exchange threw =', e?.message);
          setLinkError(e?.message ?? 'Exchange failed');
          router.replace('/(auth)/confirm');
        });
    };
    Linking.getInitialURL().then(handleAuthLink).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => handleAuthLink(url));

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user) await loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => {
      active = false;
      linkSub.remove();
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data ?? null);
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      linkError,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      },
      async signUpWithPassword(email, password, displayName) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: displayName ? { display_name: displayName } : undefined,
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
      },
      async sendMagicLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
      },
      async signOut() {
        await supabase.auth.signOut();
        setProfile(null);
      },
      refreshProfile,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, profile, loading, linkError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
