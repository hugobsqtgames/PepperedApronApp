import type { Ingredient } from '@pepperedapron/core';
import {
  fromIngRows,
  fromStepRows,
  ingredientToLine,
  move,
  numOrNull,
  toIngRows,
  toStepRows,
  type IngRow,
} from '../src/features/recipe/editorModel';

const flour: Ingredient = {
  id: 'i1',
  group: 'Pâte',
  name: 'farine',
  quantity: 200,
  quantityMax: null,
  unit: 'g',
  note: 'tamisée',
};

describe('ingredient rows', () => {
  it('renders a readable line', () => {
    expect(ingredientToLine(flour, 'fr')).toBe('200 g farine (tamisée)');
  });

  it('round-trips unchanged lines without re-parsing drift', () => {
    const rows = toIngRows([flour], 'fr');
    expect(rows[0]).toMatchObject({ kind: 'group', name: 'Pâte' });
    expect(fromIngRows(rows, 'fr')).toEqual([flour]);
  });

  it('re-parses edited lines and keeps the ingredient id', () => {
    const rows = toIngRows([flour], 'fr').map((r) =>
      r.kind === 'ing' ? { ...r, text: '1/2 kg de sucre' } : r,
    );
    const [out] = fromIngRows(rows, 'fr');
    expect(out).toMatchObject({ id: 'i1', group: 'Pâte', quantity: 0.5, unit: 'kg' });
    expect(out!.name).toContain('sucre');
  });

  it('skips blank lines and assigns ids to new ones', () => {
    const rows: IngRow[] = [
      { kind: 'ing', key: 'a', text: '   ', source: null },
      { kind: 'ing', key: 'b', text: '3 œufs', source: null },
    ];
    const out = fromIngRows(rows, 'fr');
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out[0]).toMatchObject({ quantity: 3, group: null });
  });
});

describe('step rows', () => {
  it('converts timers between minutes and seconds with bounds', () => {
    const rows = toStepRows([
      { id: 's1', group: null, text: 'Cuire', timerSeconds: 90, timerLabel: null },
    ]);
    expect(rows[0]).toMatchObject({ timerMin: '1.5' });
    const edited = rows.map((r) => (r.kind === 'step' ? { ...r, timerMin: '99999' } : r));
    expect(fromStepRows(edited)[0]!.timerSeconds).toBe(172800);
    const cleared = rows.map((r) => (r.kind === 'step' ? { ...r, timerMin: 'abc' } : r));
    expect(fromStepRows(cleared)[0]!.timerSeconds).toBeNull();
    const comma = rows.map((r) => (r.kind === 'step' ? { ...r, timerMin: '2,5' } : r));
    expect(fromStepRows(comma)[0]!.timerSeconds).toBe(150);
  });
});

describe('helpers', () => {
  it('moves items and ignores out-of-range moves', () => {
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
  });

  it('parses numeric inputs defensively', () => {
    expect(numOrNull('12')).toBe(12);
    expect(numOrNull('7,6')).toBe(8);
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('-3')).toBeNull();
    expect(numOrNull('douze')).toBeNull();
  });
});
