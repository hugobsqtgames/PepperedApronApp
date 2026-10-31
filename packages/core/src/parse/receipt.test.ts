import { describe, expect, it } from 'vitest';
import { packSize, pantryPlaceFor, parseReceipt, receiptRows } from './receipt';
import { cleanScreenshotText, looksLikeScreenshot } from './screenshot';

const RECEIPT = `CARREFOUR MARKET
12 RUE DE LA PAIX 75002 PARIS
TEL 01 23 45 67 89
31/10/2026 18:42
LAIT 1/2 ECR CRF 1L        1,05 €
2 x 1,05
BEURRE DOUX 250G           2,49 €
POMMES DE TERRE 2,5KG      3,20 €
COURGETTES
0,512 kg x 2,99 €/kg       1,53 €
POULET FIL 400G            6,90 €
EPINARDS SURG 1KG          2,30 €
LESSIVE LIQUIDE 2L         8,99 €
YAOURT NAT 4X125G          1,60 €
SOUS TOTAL                29,11 €
TOTAL                     29,11 €
CB EMV                    29,11 €
TVA 5,5%                   1,20
MERCI DE VOTRE VISITE`;

describe('receipt', () => {
  it('keeps the products, with sizes, weights and a place', () => {
    const items = parseReceipt(RECEIPT.split('\n'));
    expect(items.map((i) => i.name)).toEqual([
      'Lait demi-écrémé',
      'Beurre doux',
      'Pommes de terre',
      'Courgettes',
      'Poulet filet',
      'Epinards surgelé',
      'Lessive liquide',
      'Yaourt nat',
    ]);
    const by = (n: string) => items.find((i) => i.name === n)!;
    expect(by('Lait demi-écrémé')).toMatchObject({ quantity: 2, unit: 'l', place: 'fridge' });
    expect(by('Beurre doux')).toMatchObject({ quantity: 250, unit: 'g', place: 'fridge' });
    expect(by('Pommes de terre')).toMatchObject({ quantity: 2.5, unit: 'kg', place: 'pantry' });
    expect(by('Courgettes')).toMatchObject({ quantity: 512, unit: 'g', place: 'fridge' });
    expect(by('Epinards surgelé').place).toBe('freezer');
    expect(by('Yaourt nat')).toMatchObject({ quantity: 500, unit: 'g' });
    expect(by('Lessive liquide').food).toBe(false);
    expect(by('Poulet filet').food).toBe(true);
  });

  it('puts back together the name and the price read apart on the same line', () => {
    expect(
      receiptRows([
        { text: '2,49 €', x: 0.8, y: 0.3, width: 0.1, height: 0.02 },
        { text: 'BEURRE DOUX', x: 0.1, y: 0.302, width: 0.3, height: 0.02 },
        { text: 'LAIT', x: 0.1, y: 0.2, width: 0.2, height: 0.02 },
      ]),
    ).toEqual(['LAIT', 'BEURRE DOUX 2,49 €']);
  });

  it('a receipt that is not one gives nothing', () => {
    expect(parseReceipt(['TOTAL 12,00', 'CB 12,00', '31/10/2026'])).toEqual([]);
  });
});

describe('screenshots', () => {
  const STORY = `9:41
87 %
chef.marie • Suivre
Gâteau au yaourt 🍋
3 œufs
1 pot de yaourt
2 pots de sucre
Mélanger puis cuire 30 min à 180 °C.
1 234 j'aime
Voir les 24 commentaires
2 h
Envoyer un message`;
  it('drops the status bar and the app’s own words', () => {
    expect(looksLikeScreenshot(STORY)).toBe(true);
    expect(cleanScreenshotText(STORY)).toBe(
      [
        'Gâteau au yaourt 🍋',
        '3 œufs',
        '1 pot de yaourt',
        '2 pots de sucre',
        'Mélanger puis cuire 30 min à 180 °C.',
      ].join('\n'),
    );
  });
  it('a photo of a cookbook is not a screenshot', () => {
    expect(
      looksLikeScreenshot('Tarte aux pommes\n6 pommes\n200 g de farine\nÉtaler la pâte.'),
    ).toBe(false);
  });
});

describe('pack size and place', () => {
  it('reads the size printed on a pack', () => {
    expect(packSize('500 g')).toEqual({ quantity: 500, unit: 'g' });
    expect(packSize('6 x 125 g')).toEqual({ quantity: 750, unit: 'g' });
    expect(packSize('1,5 L')).toEqual({ quantity: 1.5, unit: 'l' });
    expect(packSize('6 pièces')).toEqual({ quantity: null, unit: null });
  });
  it('guesses where a product is kept', () => {
    expect(pantryPlaceFor('Crème fraîche')).toBe('fridge');
    expect(pantryPlaceFor('Pâtes')).toBe('pantry');
    expect(pantryPlaceFor('Petits pois surgelés')).toBe('freezer');
    expect(pantryPlaceFor('Oignons')).toBe('pantry');
  });
});
