import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { emptyRecipe } from '@pepperedapron/client';
import '../src/i18n';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { RecipeCard } from '../src/ui/RecipeCard';

// Like expo-router's Link asChild (Slot): the child is cloned with the link's props merged into
// its style as an array, where a style function is not called.
jest.mock('expo-router', () => {
  const { cloneElement, isValidElement } = jest.requireActual<typeof import('react')>('react');
  const Link = ({ children }: { children: ReactElement<{ style?: unknown }> }) =>
    isValidElement(children)
      ? cloneElement(children, {
          style: [
            {},
            typeof children.props.style === 'function' ? undefined : children.props.style,
          ],
        })
      : null;
  Link.AppleZoom = ({ children }: { children: unknown }) => children;
  return { Link, router: { push: jest.fn() } };
});

/* Regression (seen on the iPhone): on the home carousels, the card lost its width and its title
   ran across the whole screen. */
it.each([
  ['tile', 168],
  ['wide', 280],
] as const)('a %s card opened by zoom keeps its width', async (variant, width) => {
  const recipe = {
    id: '01a18c7c-3384-70f0-a814-b3360db32b8a',
    hlc: '',
    updatedAt: '',
    data: {
      ...emptyRecipe(),
      title: 'Une flemme à la louloukitchen bien sûr One pot direct tout au four',
    },
  } as never;
  await render(
    <ThemeProvider preference="light">
      <RecipeCard recipe={recipe} onPress={() => {}} zoom variant={variant} width={width} />
    </ThemeProvider>,
  );
  const card = screen.getAllByRole('button')[0]!;
  expect(StyleSheet.flatten(card.props.style).width).toBe(width);
});
