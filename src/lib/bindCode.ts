/**
 * classifyScanForBinding — what to do with a code scanned from an item's or
 * place's detail screen, where the intent is "add this code to this thing".
 *
 * Separate from `resolveScan` (which decides where to *navigate*): here the
 * entity is already known, so the only questions are whether the code is free,
 * already ours, or someone else's.
 */
import type { ResolvedCode, ScanOutcome } from './scanner';
import type { ExternalEntityType } from './supabase';

export interface BindTarget {
  entityType: ExternalEntityType;
  entityId: string;
}

export type BindClassification =
  /** A StuffSearch app QR — it already resolves on its own, binding it adds nothing. */
  | { kind: 'app-code' }
  /** This exact code is already bound to this entity. */
  | { kind: 'already-here' }
  /** Bound to something else (possibly in another household). */
  | { kind: 'bound-elsewhere'; match: ResolvedCode }
  /** Unclaimed — safe to bind. */
  | { kind: 'free'; codeValue: string };

export function classifyScanForBinding(
  outcome: ScanOutcome,
  target: BindTarget,
): BindClassification {
  if (outcome.type === 'deep-link') return { kind: 'app-code' };
  if (outcome.type === 'no-match') return { kind: 'free', codeValue: outcome.codeValue };

  // A code can resolve in several of the user's households. Only a binding in
  // the ACTIVE household can be "already here" — binding happens within the
  // active household, so a same-id row elsewhere is still someone else's.
  const mine = outcome.matches.find(
    (m) =>
      m.household_id === outcome.activeHouseholdId &&
      m.entity_type === target.entityType &&
      m.entity_id === target.entityId,
  );
  if (mine) return { kind: 'already-here' };
  return { kind: 'bound-elsewhere', match: outcome.matches[0] };
}
