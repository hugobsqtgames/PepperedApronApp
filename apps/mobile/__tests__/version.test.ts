import { compareVersions } from '../src/lib/version';

describe('compareVersions', () => {
  it.each([
    ['2.0.0', '2.0.0', 0],
    ['2.10.0', '2.9.3', 1],
    ['2.0', '2.0.1', -1],
    ['1.9.9', '2.0.0', -1],
    ['3', '2.99.99', 1],
    ['2.0.0-beta', '2.0.0', 0],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
