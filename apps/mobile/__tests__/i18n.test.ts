import fr from '../src/i18n/fr';
import en from '../src/i18n/en';
import es from '../src/i18n/es';
import de from '../src/i18n/de';
import itCatalogue from '../src/i18n/it';

type Tree = { [k: string]: unknown };

function flatten(obj: Tree, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, vv] of flatten(v as Tree, key)) out.set(kk, vv);
    } else out.set(key, v);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const source = flatten(fr as unknown as Tree);
const catalogues = { en, es, de, it: itCatalogue };

describe.each(Object.entries(catalogues))('%s catalogue', (_name, cat) => {
  const flat = flatten(cat as unknown as Tree);

  it('has exactly the same keys as French', () => {
    expect([...flat.keys()].sort()).toEqual([...source.keys()].sort());
  });

  it('keeps every interpolation placeholder', () => {
    for (const [key, value] of source) {
      if (typeof value !== 'string') continue;
      expect({ key, p: placeholders(flat.get(key) as string) }).toEqual({
        key,
        p: placeholders(value),
      });
    }
  });

  it('has no empty strings and is actually translated', () => {
    let identical = 0;
    for (const [key, value] of flat) {
      if (typeof value === 'string')
        expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
      if (value === source.get(key)) identical++;
    }
    // Brand names, units and a few cognates are legitimately identical; anything above that means
    // the catalogue was copied instead of translated.
    expect(identical / flat.size).toBeLessThan(0.2);
  });

  it('uses a confirmation word typeable on a phone keyboard', () => {
    expect((cat as typeof fr).settings.deleteWord).toMatch(/^[\p{Lu}]+$/u);
  });
});
