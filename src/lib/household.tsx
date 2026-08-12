/**
 * HouseholdProvider — tracks the user's households, the active one, and the
 * current user's role within it. Persisted to AsyncStorage so the active scope
 * survives restarts. All household-scoped queries read `activeHouseholdId`
 * from here.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, type Household, type HouseholdMember, type HouseholdRole } from './supabase';
import { useAuth } from './auth';
import { toError } from './errors';

interface HouseholdMembership extends HouseholdMember {
  households: Household;
}

interface HouseholdContextValue {
  /** All households the user belongs to (with their membership row). */
  memberships: HouseholdMembership[];
  activeHousehold: Household | null;
  activeHouseholdId: string | null;
  /** The user's role in the active household (null if none). */
  activeRole: HouseholdRole | null;
  loading: boolean;
  /** Switch the active household (persisted). */
  setActiveHousehold: (id: string) => Promise<void>;
  /** Create a household owned by the current user and join it as owner. */
  createHousehold: (name: string) => Promise<Household>;
  /** Join a household via its invite token (self-join as member). */
  joinByInviteToken: (token: string) => Promise<Household>;
  refresh: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);
const ACTIVE_KEY = 'stuffsearch.activeHousehold';

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<HouseholdMembership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load memberships whenever the signed-in user changes.
  useEffect(() => {
    if (!user) {
      setMemberships([]);
      setActiveId(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await loadMemberships();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadMemberships() {
    if (!user) return;
    const { data, error } = await supabase
      .from('household_members')
      .select('*, households(*)')
      .eq('user_id', user.id);
    if (error || !data) {
      setMemberships([]);
      return;
    }
    setMemberships(data as HouseholdMembership[]);
    // Restore saved active id, else fall back to the first household.
    let next = activeId;
    if (!next) {
      try {
        next = (await AsyncStorage.getItem(ACTIVE_KEY)) ?? data[0]?.households.id ?? null;
      } catch {
        next = data[0]?.households.id ?? null;
      }
    }
    // Ensure the active id is still a member; otherwise fall back.
    const stillMember = data.some((m) => m.households.id === next);
    setActiveId(stillMember ? next : data[0]?.households.id ?? null);
  }

  async function refresh() {
    await loadMemberships();
  }

  async function setActiveHousehold(id: string) {
    setActiveId(id);
    try {
      await AsyncStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* best-effort persistence */
    }
  }

  async function createHousehold(name: string): Promise<Household> {
    if (!user) throw new Error('Sign in first.');
    // Guard: the Supabase client must actually carry a live session. If the
    // access token is missing or stale, PostgREST treats the insert as
    // anonymous and RLS rejects it with a cryptic "new row violates row-level
    // security policy" (42501) — which previously surfaced as "[object Object]".
    // Force a refresh (best-effort) so we send a valid token; surface a clear
    // error if there's no session to refresh.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw new Error('Your session has expired. Please sign in again.');
    await supabase.auth.refreshSession().catch(() => {
      /* best-effort; if refresh fails the insert will surface the RLS error */
    });
    // Insert household, then owner membership. The read-back `.select().single()`
    // works because the owner-SELECT policy (0005) permits reading by owner_id
    // even before the membership row exists.
    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .insert({ name, owner_id: user.id })
      .select()
      .single();
    if (hhErr) throw toError(hhErr);
    if (!hh) throw new Error('Failed to create household.');
    const { error: mErr } = await supabase
      .from('household_members')
      .insert({ household_id: hh.id, user_id: user.id, role: 'owner' });
    if (mErr) throw toError(mErr);
    await loadMemberships();
    await setActiveHousehold(hh.id);
    return hh;
  }

  async function joinByInviteToken(token: string): Promise<Household> {
    if (!user) throw new Error('Sign in first.');
    // NOTE: reading a household by invite_token is currently gated by the
    // member-visibility SELECT policy, so a non-member will get null here and
    // see "Invalid invite code." even with a valid token. Resolving that needs
    // a SECURITY DEFINER lookup RPC and is tracked as a follow-up.
    const { data: hh, error } = await supabase
      .from('households')
      .select()
      .eq('invite_token', token)
      .maybeSingle();
    if (error) throw toError(error);
    if (!hh) throw new Error('Invalid invite code.');
    // Idempotent join: if already a member, keep existing role; otherwise add as member.
    const { error: mErr } = await supabase
      .from('household_members')
      .upsert(
        { household_id: hh.id, user_id: user.id, role: 'member' },
        { onConflict: 'household_id,user_id', ignoreDuplicates: true },
      );
    if (mErr) throw toError(mErr);
    await loadMemberships();
    await setActiveHousehold(hh.id);
    return hh;
  }

  const activeHousehold = useMemo(
    () => memberships.find((m) => m.households.id === activeId)?.households ?? null,
    [memberships, activeId],
  );
  const activeRole = useMemo(
    () => memberships.find((m) => m.households.id === activeId)?.role ?? null,
    [memberships, activeId],
  );

  const value: HouseholdContextValue = {
    memberships,
    activeHousehold,
    activeHouseholdId: activeId,
    activeRole,
    loading,
    setActiveHousehold,
    createHousehold,
    joinByInviteToken,
    refresh,
  };

  return (
    <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within <HouseholdProvider>');
  return ctx;
}
