import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CategoryGrid } from '../src/features/home/CategoryGrid';
import '../src/i18n';
import { ThemeProvider } from '../src/theme/ThemeProvider';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/* Regression (seen on the iPhone): the photo must be exactly the tile's size, not its own. */
it('each category photo has the size of its tile', async () => {
  await render(
    <ThemeProvider preference="light">
      <CategoryGrid counts={{}} />
    </ThemeProvider>,
  );
  const tiles = screen.getAllByRole('button');
  expect(tiles.length).toBeGreaterThan(4);
  const photos = screen.getAllByTestId('category-photo');
  expect(photos).toHaveLength(tiles.length);
  tiles.forEach((tile, i) => {
    const tileStyle = StyleSheet.flatten(tile.props.style);
    const photo = StyleSheet.flatten(photos[i]!.props.style);
    expect(photo.width).toBe(tileStyle.width);
    expect(photo.height).toBe(tileStyle.height);
    expect(photo.width).toBeGreaterThan(0);
  });
});

/* Regression (TestFlight): the "All your recipes" tile showed a blurry corner of its photo. */
it('the "All your recipes" photos fill the tile exactly, side by side', async () => {
  await render(
    <ThemeProvider preference="light">
      <CategoryGrid counts={{}} total={12} />
    </ThemeProvider>,
  );
  const tile = StyleSheet.flatten(screen.getByTestId('all-recipes-tile').props.style);
  const photos = screen
    .getAllByTestId('all-recipes-photo')
    .map((p) => StyleSheet.flatten(p.props.style));
  expect(photos.length).toBeGreaterThan(1);
  expect(tile.width).toBeGreaterThan(0);
  let x = 0;
  for (const p of photos) {
    expect(p.left).toBeCloseTo(x);
    expect(p.height).toBe(tile.height);
    expect(p.width).toBeGreaterThan(0);
    x += p.width;
  }
  expect(x).toBeCloseTo(tile.width);
});
