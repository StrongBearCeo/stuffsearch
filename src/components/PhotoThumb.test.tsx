/**
 * Rendering tests for the stacked list thumbnail.
 *
 * A list showing only the cover photo gave no hint that an item had five more,
 * so the only way to find out was to open every row. The stack and its badge
 * are the hint — which makes "does the badge actually appear, and does it say
 * the right number" the thing worth pinning down.
 *
 * (RTL v14's `render` is async — see useRouteFilter.test.tsx.)
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { PhotoThumb } from './PhotoThumb';

const photo = (n: number) => `https://cdn.test/${n}.jpg`;
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i));

describe('PhotoThumb', () => {
  it('shows no badge for a single photo — nothing more to discover', async () => {
    const { queryByTestId } = await render(<PhotoThumb photos={photos(1)} />);
    expect(queryByTestId('photo-count-badge')).toBeNull();
  });

  it('shows no badge when there are no photos at all', async () => {
    const { queryByTestId } = await render(<PhotoThumb photos={[]} />);
    expect(queryByTestId('photo-count-badge')).toBeNull();
  });

  it('badges the exact count for two', async () => {
    const { getByTestId } = await render(<PhotoThumb photos={photos(2)} />);
    expect(getByTestId('photo-count-badge')).toHaveTextContent('2');
  });

  it('badges the exact count for many — the badge carries the number, not the edges', async () => {
    const { getByTestId } = await render(<PhotoThumb photos={photos(7)} />);
    expect(getByTestId('photo-count-badge')).toHaveTextContent('7');
  });

  it('renders the fallback only when there is no photo', async () => {
    const withNone = await render(
      <PhotoThumb photos={[]} fallback={<Text testID="fallback">📦</Text>} />,
    );
    expect(withNone.queryByTestId('fallback')).not.toBeNull();

    const withOne = await render(
      <PhotoThumb photos={photos(1)} fallback={<Text testID="fallback">📦</Text>} />,
    );
    expect(withOne.queryByTestId('fallback')).toBeNull();
  });

  it('announces the count to screen readers', async () => {
    const { getByLabelText } = await render(
      <PhotoThumb photos={photos(3)} accessibilityLabel="Loctite box" />,
    );
    expect(getByLabelText('Loctite box, 3 photos')).toBeTruthy();
  });

  it('leaves the label alone when there is nothing extra to announce', async () => {
    const { getByLabelText } = await render(
      <PhotoThumb photos={photos(1)} accessibilityLabel="Loctite box" />,
    );
    expect(getByLabelText('Loctite box')).toBeTruthy();
  });
});
