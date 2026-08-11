/** Responsive layout hook. Returns layout decisions keyed off window width.
 *
 * Uses the `tabletBreakpoint` (768) from the theme: on phones this triggers in
 * landscape (≈800 logical px) and on tablets in both orientations. Screens
 * consume `columns` for FlatList grids and `contentMaxWidth` to cap centered
 * content so it doesn't stretch across the full landscape width.
 *
 *   const { isWide, columns, contentMaxWidth } = useResponsive();
 */
import { useWindowDimensions } from 'react-native';
import { tabletBreakpoint } from '../theme';

export const CONTENT_MAX_WIDTH = 720;

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isWide = width >= tabletBreakpoint;
  return {
    isWide,
    columns: isWide ? 2 : 1,
    contentMaxWidth: CONTENT_MAX_WIDTH,
    width,
  };
}
