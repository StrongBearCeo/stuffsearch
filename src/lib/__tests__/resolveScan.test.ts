/**
 * Unit tests for resolveScan (the scan resolution state machine).
 * The supabase client is globally stubbed in jest.setup.ts; here we override
 * the `rpc` return per-test to exercise each outcome branch.
 */
import { resolveScan } from '../scanner';
import { supabase } from '../supabase';

// Cast the stubbed rpc to a jest.fn for per-test control.
const mockRpc = jest.fn();
(supabase as unknown as { rpc: jest.Mock }).rpc = mockRpc;

describe('resolveScan', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('returns deep-link outcome for a stuffsearch:// payload', async () => {
    const o = await resolveScan('stuffsearch://item/abc123?h=1a2b3c4d', 'user1', 'hh_active');
    expect(o).toEqual({
      type: 'deep-link',
      target: { kind: 'item', token: 'abc123', householdShort: '1a2b3c4d' },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns no-match when RPC returns empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const o = await resolveScan('0123456789012', 'user1', 'hh_active');
    expect(o).toEqual({ type: 'no-match', codeValue: '0123456789012' });
  });

  it('returns matched in active household', async () => {
    mockRpc.mockResolvedValue({
      data: [{ household_id: 'hh_active', entity_type: 'item', entity_id: 'item1' }],
      error: null,
    });
    const o = await resolveScan('somecode', 'user1', 'hh_active');
    expect(o).toEqual({
      type: 'matched',
      inActiveHousehold: true,
      activeHouseholdId: 'hh_active',
      matches: [{ household_id: 'hh_active', entity_type: 'item', entity_id: 'item1' }],
    });
  });

  it('returns matched elsewhere when the only match is a different household', async () => {
    mockRpc.mockResolvedValue({
      data: [{ household_id: 'hh_other', entity_type: 'item', entity_id: 'item2' }],
      error: null,
    });
    const o = await resolveScan('somecode', 'user1', 'hh_active');
    expect(o.type).toBe('matched');
    expect((o as { inActiveHousehold: boolean }).inActiveHousehold).toBe(false);
  });

  it('reports inActive=false when activeHouseholdId is null', async () => {
    mockRpc.mockResolvedValue({
      data: [{ household_id: 'hh_active', entity_type: 'place', entity_id: 'place1' }],
      error: null,
    });
    const o = await resolveScan('somecode', 'user1', null);
    expect(o.type).toBe('matched');
    expect((o as { inActiveHousehold: boolean }).inActiveHousehold).toBe(false);
  });

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });
    await expect(resolveScan('somecode', 'user1', 'hh_active')).rejects.toThrow('rpc failed');
  });

  it('handles multiple matches across households', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { household_id: 'hh_active', entity_type: 'item', entity_id: 'item1' },
        { household_id: 'hh_other', entity_type: 'item', entity_id: 'item2' },
      ],
      error: null,
    });
    const o = await resolveScan('sharedcode', 'user1', 'hh_active');
    expect(o.type).toBe('matched');
    expect((o as { inActiveHousehold: boolean }).inActiveHousehold).toBe(true);
    expect((o as { matches: unknown[] }).matches).toHaveLength(2);
  });
});
