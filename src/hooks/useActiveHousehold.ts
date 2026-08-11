/** useActiveHousehold: convenience selector over the household context. */
import { useHousehold } from '../lib/household';

export function useActiveHousehold() {
  const { activeHousehold, activeHouseholdId, activeRole, setActiveHousehold, memberships } =
    useHousehold();
  return {
    household: activeHousehold,
    householdId: activeHouseholdId,
    role: activeRole,
    isOwner: activeRole === 'owner',
    setActiveHousehold,
    memberships,
  };
}
