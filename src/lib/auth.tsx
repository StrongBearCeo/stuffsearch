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
import { parseAuthDeepLink } from './authLink';
import { bootstrapSession } from './authBootstrap';

/**
 * Where Supabase email/magic-link redirects should land. Auto-adapts to the
 * runtime: `exp://<devhost>/--/confirm` in Expo Go, `stuffsearch:///confirm`
 * in a standalone/dev-client build. The root Linking handler exchanges the
 * PKCE code for a session.
 */
const redirectTo = Linking.createURL('/confirm');

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Error from the last deep-link code exchange, if it failed. */
  linkError: string | null;
  /** Error from the session bootstrap, if it threw (would otherwise hang the
   *  loading spinner forever in a release build where the rejection is silent). */
  initError: Error | null;
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
  const [initError, setInitError] = useState<Error | null>(null);

  // Bootstrap session, then subscribe to auth changes.
  useEffect(() => {
    let active = true;
    // Delegated to bootstrapSession (pure/testable): the loading gate unblocks
    // as soon as getSession resolves, without waiting on the profile network
    // fetch. See authBootstrap.ts for the rationale.
    bootstrapSession({
      getSession: () => supabase.auth.getSession(),
      loadProfile,
      setSession,
      setLoading,
      setInitError,
      isActive: () => active,
    });

    // Handle Supabase email/magic-link deep links at the root, independent of
    // expo-router path matching (see file header for the slash-canonicalization
    // rationale). The link may arrive as `stuffsearch:///confirm?code=…`
    // (path form) or `stuffsearch://confirm?code=…` (host form); parseAuthDeepLink
    // pulls the `code` out of either shape.
    // A cold start delivers the link via getInitialURL and a warm one via the
    // `url` event, but both can fire for a single link. The PKCE verifier is
    // single-use and auth-js deletes it on the first exchange, so a second
    // attempt on the same code would fail and bounce a successfully signed-in
    // user to the error screen. Exchange each code at most once.
    const handledCodes = new Set<string>();

    const handleAuthLink = (raw: string | null) => {
      const link = parseAuthDeepLink(raw);
      // Not an auth redirect (e.g. a `stuffsearch://item/…` scan link) — leave
      // it for expo-router.
      if (!link) return;

      if (link.kind === 'error') {
        setLinkError(link.message);
        router.replace('/(auth)/confirm');
        return;
      }

      // Pass the CODE, never the whole URL: auth-js posts this straight through
      // as `auth_code`, and on failure deletes the stored PKCE verifier, which
      // breaks every subsequent attempt too.
      if (handledCodes.has(link.code)) return;
      handledCodes.add(link.code);

      supabase.auth
        .exchangeCodeForSession(link.code)
        .then(({ error }) => {
          if (error) {
            setLinkError(error.message);
            router.replace('/(auth)/confirm');
            return;
          }
          router.replace('/');
        })
        .catch((e) => {
          setLinkError(e?.message ?? 'Exchange failed');
          router.replace('/(auth)/confirm');
        });
    };
    Linking.getInitialURL().then(handleAuthLink).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => handleAuthLink(url));

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id).catch(() => {});
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
      initError,
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
    [session, profile, loading, linkError, initError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
