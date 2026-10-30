import { describe, expect, it } from 'vitest';
import { deductPantry, expiringSoon, weekSummary } from './pantry';

const line = (name: string, quantity: number | null, unit: string | null) => ({
  name,
  quantity,
  unit,
  recipeIds: ['r'],
});

describe('pantry', () => {
  it('does not buy again what is at home, or buys only what is missing', () => {
    const pantry = [
      { name: 'Riz', quantity: null, unit: null },
      { name: 'farine', quantity: 200, unit: 'g' },
      { name: 'oeufs', quantity: 6, unit: null },
      { name: 'lait', quantity: 1, unit: 'l' },
      { name: 'beurre', quantity: 1, unit: 'plaquette' },
    ];
    const { lines, skipped } = deductPantry(
      [
        line('riz', 300, 'g'),
        line('farine', 0.5, 'kg'),
        line('œufs', 4, null),
        line('lait', 50, 'cl'),
        line('beurre', 50, 'g'),
        line('tomates', 3, null),
      ],
      pantry,
    );
    expect(skipped).toEqual(['riz', 'œufs', 'lait', 'beurre']);
    expect(lines.map((l) => [l.name, l.quantity, l.unit])).toEqual([
      ['farine', 300, 'g'],
      ['tomates', 3, null],
    ]);
  });

  it('lists what expires soon, soonest first', () => {
    const items = [
      { id: 'a', expiresOn: '2026-11-05' },
      { id: 'b', expiresOn: '2026-10-29' },
      { id: 'c', expiresOn: null },
      { id: 'd', expiresOn: '2026-11-01' },
    ];
    expect(expiringSoon(items, '2026-10-30').map((i) => i.id)).toEqual(['b', 'd']);
  });

  it('sums up the week', () => {
    const ings: Record<string, string[]> = {
      soup: ['potimarron', 'crème'],
      chicken: ['poulet', 'citron'],
    };
    const s = weekSummary({
      start: '2026-10-26',
      end: '2026-11-01',
      entries: [
        { date: '2026-10-26', recipeId: 'soup' },
        { date: '2026-10-27', recipeId: 'chicken' },
        { date: '2026-10-28', recipeId: 'soup', leftover: true },
        { date: '2026-10-29', recipeId: null },
        { date: '2026-11-03', recipeId: 'chicken' },
      ],
      logs: [
        { recipeId: 'soup', date: '2026-10-26' },
        { recipeId: 'soup', date: '2026-09-01' },
        { recipeId: 'chicken', date: '2026-08-01' },
      ],
      recipeIngredients: (id) => ings[id] ?? null,
      items: [
        { price: 3.2, recipeIds: ['soup'] },
        { price: 5, recipeIds: ['chicken'] },
        { price: 9, recipeIds: ['other'] },
        { price: null, recipeIds: ['soup'] },
      ],
    });
    expect(s).toEqual({
      planned: 4,
      cooked: 1,
      vegetarianShare: 0.5,
      budget: 8.2,
      favorites: [{ recipeId: 'soup', count: 2 }],
    });
  });
});
