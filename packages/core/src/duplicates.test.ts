import { describe, expect, it } from 'vitest';
import { canonicalUrl, findDuplicate } from './duplicates';

describe('duplicates', () => {
  it('one key per publication', () => {
    expect(canonicalUrl('https://www.instagram.com/reel/C9xQ2abc/?igsh=MTZ')).toBe(
      'instagram:C9xQ2abc',
    );
    expect(canonicalUrl('https://instagram.com/p/C9xQ2abc')).toBe('instagram:C9xQ2abc');
    expect(canonicalUrl('https://www.tiktok.com/@chef/video/7421900?is_from_webapp=1')).toBe(
      'tiktok:7421900',
    );
    expect(canonicalUrl('https://youtu.be/abc123?si=x')).toBe('youtube:abc123');
    expect(canonicalUrl('https://www.youtube.com/shorts/abc123')).toBe('youtube:abc123');
    expect(canonicalUrl('https://www.marmiton.org/recettes/tarte.aspx?utm_source=x&id=4/')).toBe(
      'marmiton.org/recettes/tarte.aspx?id=4/',
    );
    expect(canonicalUrl('pas un lien')).toBeNull();
  });
  const existing = [
    {
      id: 'a',
      title: 'Poulet citron rapide',
      sourceUrl: 'https://www.instagram.com/reel/XYZ/',
      ingredientNames: ['poulet', 'citron', 'ail', 'huile'],
    },
    { id: 'b', title: 'Tarte aux pommes', sourceUrl: null, ingredientNames: [] },
  ];
  it('same link', () => {
    expect(
      findDuplicate(
        {
          title: 'Autre titre',
          sourceUrl: 'https://instagram.com/p/XYZ?igsh=1',
          ingredientNames: [],
        },
        existing,
      ),
    ).toEqual({ id: 'a', reason: 'link' });
  });
  it('similar title and ingredients', () => {
    expect(
      findDuplicate(
        {
          title: 'Poulet au citron rapide',
          sourceUrl: null,
          ingredientNames: ['Poulet', 'Citrons', 'Ail', 'Sel'],
        },
        existing,
      ),
    ).toEqual({ id: 'a', reason: 'similar' });
    expect(
      findDuplicate({ title: 'Tarte aux pommes', sourceUrl: null, ingredientNames: [] }, existing),
    ).toEqual({ id: 'b', reason: 'similar' });
    expect(
      findDuplicate(
        {
          title: 'Poulet citron rapide',
          sourceUrl: null,
          ingredientNames: ['poulet', 'riz', 'curry', 'coco'],
        },
        existing,
      ),
    ).toBeNull();
    expect(
      findDuplicate({ title: 'Tarte aux poires', sourceUrl: null, ingredientNames: [] }, existing),
    ).toBeNull();
  });
  it('two different publications with the same name are two recipes', () => {
    expect(
      findDuplicate(
        {
          title: 'Poulet citron rapide',
          sourceUrl: 'https://www.instagram.com/reel/OTHER/',
          ingredientNames: ['poulet', 'citron', 'ail', 'huile'],
        },
        existing,
      ),
    ).toBeNull();
  });
  it('regression: the same recipe word for word from two links is a duplicate', () => {
    const steps = [
      'Faire revenir le poulet dans l’huile avec l’ail.',
      'Ajouter le citron et cuire 10 minutes.',
    ];
    const one = {
      id: 'a',
      title: 'Poulet citron rapide',
      sourceUrl: 'https://www.instagram.com/reel/ABC/',
      ingredientNames: ['poulet', 'citron', 'ail', 'huile'],
      stepTexts: steps,
    };
    expect(
      findDuplicate({ ...one, sourceUrl: 'https://www.pinterest.com/pin/123456789/' }, [one]),
    ).toEqual({ id: 'a', reason: 'similar' });
    // Same name and ingredients, other steps: two recipes.
    expect(
      findDuplicate(
        {
          ...one,
          sourceUrl: 'https://www.pinterest.com/pin/123456789/',
          stepTexts: [
            'Mariner le poulet une nuit au frigo.',
            'Griller au barbecue et servir avec du riz.',
          ],
        },
        [one],
      ),
    ).toBeNull();
  });
});
