/**
 * Regression tests for the home screen's "needs attention" filter.
 *
 * THE BUG THIS EXISTS FOR. Tapping "10 not in a place" on the home screen
 * pushed `?filter=unplaced` and the list filtered correctly. Dismissing the
 * chip set a local `dismissedFilter` boolean — and the items list is a TAB
 * screen, so it never unmounts and that flag never reset. Every later tap on
 * the tile pushed the param, found the flag still true, and showed an
 * unfiltered list. Force-closing the app was the only way to recover.
 *
 * The rule, then: DISMISSAL MUST NOT OUTLIVE THE ARRIVAL OF A NEW PARAM. That
 * is a statement about state lifetime, not about logic, which is why the
 * node-only suite could not have caught it — `isItemFilter` and
 * `applyItemFilter` were both fully tested and both entirely correct.
 *
 * Note RTL v14's `render`, `rerender` and `fireEvent` are async: they return
 * Promises so React can flush concurrent work. Forgetting to await one hands
 * back a bare Promise and a baffling "getByTestId is not a function".
 */
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

/** The route params the hook reads, controlled per test.
 *  Jest hoists `jest.mock` above the imports, so anything its factory closes
 *  over must be `mock`-prefixed. */
let mockParams: Record<string, string | undefined> = {};
const mockSetParams = jest.fn((next: Record<string, string | undefined>) => {
  mockParams = { ...mockParams, ...next };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ setParams: mockSetParams }),
}));

import { useRouteFilter } from './useRouteFilter';

/** Renders the hook's output so the assertions read like the UI. */
function Probe() {
  const { activeFilter, clearFilter } = useRouteFilter();
  return (
    <>
      <Text testID="filter">{activeFilter ?? 'none'}</Text>
      <Text testID="clear" onPress={clearFilter}>
        clear
      </Text>
    </>
  );
}

beforeEach(() => {
  mockParams = {};
  mockSetParams.mockClear();
});

describe('useRouteFilter', () => {
  it('is inactive with no param', async () => {
    const { getByTestId } = await render(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('none');
  });

  it('activates from the route param the home tile pushes', async () => {
    mockParams = { filter: 'unplaced' };
    const { getByTestId } = await render(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('unplaced');
  });

  it('reads the other filter too', async () => {
    mockParams = { filter: 'unvalued' };
    const { getByTestId } = await render(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('unvalued');
  });

  it('ignores a filter it does not recognise', async () => {
    mockParams = { filter: 'nonsense' };
    const { getByTestId } = await render(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('none');
  });

  it('clears by emptying the PARAM, not by hiding it behind local state', async () => {
    mockParams = { filter: 'unplaced' };
    const { getByTestId } = await render(<Probe />);
    await fireEvent.press(getByTestId('clear'));
    // The param is the single source of truth; the dismissal must be visible
    // in it, or a later navigation cannot override the dismissal.
    expect(mockSetParams).toHaveBeenCalledWith({ filter: '' });
  });

  it('REGRESSION: the filter comes back when the tile is tapped again', async () => {
    // 1. Tile tapped.
    mockParams = { filter: 'unplaced' };
    const { getByTestId, rerender } = await render(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('unplaced');

    // 2. Chip dismissed — the param is cleared.
    await fireEvent.press(getByTestId('clear'));
    await rerender(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('none');

    // 3. Home, then the SAME tile tapped again. The component never unmounted,
    //    so anything remembering the dismissal would still be remembering it.
    mockParams = { filter: 'unplaced' };
    await rerender(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('unplaced');
  });

  it('REGRESSION: survives repeated dismiss / re-navigate cycles', async () => {
    mockParams = { filter: 'unvalued' };
    const { getByTestId, rerender } = await render(<Probe />);
    for (let i = 0; i < 3; i++) {
      expect(getByTestId('filter')).toHaveTextContent('unvalued');
      await fireEvent.press(getByTestId('clear'));
      await rerender(<Probe />);
      expect(getByTestId('filter')).toHaveTextContent('none');
      mockParams = { filter: 'unvalued' };
      await rerender(<Probe />);
    }
  });

  it('switches when the OTHER tile is tapped without dismissing first', async () => {
    mockParams = { filter: 'unplaced' };
    const { getByTestId, rerender } = await render(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('unplaced');
    mockParams = { filter: 'unvalued' };
    await rerender(<Probe />);
    expect(getByTestId('filter')).toHaveTextContent('unvalued');
  });
});
