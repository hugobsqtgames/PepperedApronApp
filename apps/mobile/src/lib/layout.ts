import { useWindowDimensions } from 'react-native';

/**
 * Layout classes. iPad (and large Android tablets) get a sidebar, multi-column grids and
 * side-by-side panes; phones get the tab bar and a single column.
 */
export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const wide = width >= 900;
  const gutter = width >= 700 ? 28 : 16;
  const columns = width >= 1180 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  return {
    width,
    height,
    isTablet,
    wide,
    landscape: width > height,
    gutter,
    columns,
    /** Readable line length for long forms and text. */
    contentMaxWidth: wide ? 1100 : 760,
    sidebar: width >= 768,
    fontScale,
    largeText: fontScale >= 1.35,
  };
}

/** Width of a grid tile for the given container width and number of columns. */
export function tileWidth(container: number, columns: number, gap: number, gutter: number) {
  return Math.floor((container - gutter * 2 - gap * (columns - 1)) / columns);
}
