import { classifyScanForBinding } from '../bindCode';
import type { ScanOutcome } from '../scanner';

const ENTITY = { entityType: 'item' as const, entityId: 'item-1' };

const matched = (
  entity_type: 'item' | 'place',
  entity_id: string,
  household_id = 'hh-1',
): ScanOutcome => ({
  type: 'matched',
  inActiveHousehold: household_id === 'hh-1',
  activeHouseholdId: 'hh-1',
  matches: [{ household_id, entity_type, entity_id }],
});

describe('classifyScanForBinding', () => {
  it('reports a free code, ready to bind', () => {
    expect(
      classifyScanForBinding({ type: 'no-match', codeValue: 'SS-ABC' }, ENTITY),
    ).toEqual({ kind: 'free', codeValue: 'SS-ABC' });
  });

  it('detects a code already bound to this very entity', () => {
    expect(classifyScanForBinding(matched('item', 'item-1'), ENTITY)).toEqual({
      kind: 'already-here',
    });
  });

  it('detects a code bound to a different entity', () => {
    const out = classifyScanForBinding(matched('place', 'place-9'), ENTITY);
    expect(out.kind).toBe('bound-elsewhere');
    expect(out).toMatchObject({ match: { entity_type: 'place', entity_id: 'place-9' } });
  });

  it('detects a code bound to another item of the same type', () => {
    expect(classifyScanForBinding(matched('item', 'item-2'), ENTITY).kind).toBe(
      'bound-elsewhere',
    );
  });

  it('flags a match in another household as bound elsewhere', () => {
    const out = classifyScanForBinding(matched('item', 'item-1', 'hh-2'), ENTITY);
    expect(out.kind).toBe('bound-elsewhere');
  });

  it('rejects an app-generated deep link', () => {
    const outcome: ScanOutcome = {
      type: 'deep-link',
      target: { kind: 'item', token: 'tok' },
    };
    expect(classifyScanForBinding(outcome, ENTITY)).toEqual({ kind: 'app-code' });
  });

  it('works for a place entity too', () => {
    const placeEntity = { entityType: 'place' as const, entityId: 'place-1' };
    expect(classifyScanForBinding(matched('place', 'place-1'), placeEntity)).toEqual({
      kind: 'already-here',
    });
  });

  it('checks every match, not just the first', () => {
    const outcome: ScanOutcome = {
      type: 'matched',
      inActiveHousehold: true,
      activeHouseholdId: 'hh-1',
      matches: [
        { household_id: 'hh-2', entity_type: 'item', entity_id: 'other' },
        { household_id: 'hh-1', entity_type: 'item', entity_id: 'item-1' },
      ],
    };
    expect(classifyScanForBinding(outcome, ENTITY)).toEqual({ kind: 'already-here' });
  });
});
