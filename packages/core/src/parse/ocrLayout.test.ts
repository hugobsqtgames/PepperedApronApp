import { describe, expect, it } from 'vitest';
import { paragraphsFromLines, type PlacedLine } from './ocrLayout';
import { parseRecipeText } from './text';

/** A page laid out like a cookbook: lines of ~0.025 height, 0.035 apart, paragraphs 0.06 apart. */
function page(blocks: { x: number; width: number; lines: string[]; widths?: number[] }[]) {
  const out: PlacedLine[] = [];
  let y = 0.05;
  for (const b of blocks) {
    b.lines.forEach((text, i) => {
      out.push({ text, x: b.x, y, width: b.widths?.[i] ?? b.width, height: 0.025 });
      y += 0.035;
    });
    y += 0.03;
  }
  return out;
}

/** A paragraph: every line fills the column but the last. */
const para = (lines: string[]) => ({
  x: 0.08,
  width: 0.84,
  lines,
  widths: lines.map((_, i) => (i === lines.length - 1 ? 0.4 : 0.84)),
});

const BOOK = page([
  { x: 0.08, width: 0.6, lines: ['Pâtes aux broccolinis et parmesan'] },
  { x: 0.08, width: 0.3, lines: ['Pour 4 personnes'] },
  { x: 0.08, width: 0.3, lines: ['Ingrédients'] },
  {
    x: 0.08,
    width: 0.4,
    lines: [
      '400 g de pâtes',
      '300 g de broccolinis',
      '2 gousses d’ail',
      '50 g de parmesan',
      'Sel, poivre',
    ],
    widths: [0.3, 0.38, 0.3, 0.33, 0.2],
  },
  { x: 0.08, width: 0.3, lines: ['Préparation'] },
  para([
    'Portez une grande casserole d’eau salée à ébullition. Pendant ce temps,',
    'lavez les broccolinis et coupez les tiges les plus épaisses en deux dans',
    'la longueur.',
  ]),
  para([
    'Épluchez l’ail et émincez-le finement. Faites chauffer l’huile dans une',
    'grande poêle et faites-y revenir l’ail 1 minute sans le laisser colorer.',
  ]),
  para([
    'Plongez les pâtes dans l’eau bouillante et faites-les cuire 2 minutes de',
    'moins que le temps indiqué sur le paquet. Réunissez les Avengers. J’adore',
    'les petites blagues au milieu d’une recette. Prélevez un peu d’eau de cuis-',
    'son des pâtes dans une tasse, puis égouttez les broccolinis et les pâtes.',
  ]),
  para([
    'Versez les pâtes et les broccolinis dans la poêle, ajoutez l’eau de cuisson',
    'réservée et mélangez 2 minutes sur feu vif.',
  ]),
  para([
    'Hors du feu, ajoutez le parmesan râpé, salez, poivrez et mélangez jusqu’à',
    'ce que la sauce nappe les pâtes.',
  ]),
  para(['Servez aussitôt, avec un filet d’huile d’olive et un peu de parmesan.']),
]);

describe('a book page read by the camera (TestFlight: 28 steps instead of 6)', () => {
  it('one step per paragraph, not one per printed line', () => {
    const d = parseRecipeText(paragraphsFromLines(BOOK));
    const texts = d.steps.map((x) => x.text);
    // One action per step (never one per printed line): whole sentences only.
    expect(texts.length).toBeGreaterThanOrEqual(15);
    expect(texts.length).toBeLessThanOrEqual(20);
    for (const t of texts) expect(t).toMatch(/^\p{Lu}.*[.!?]$/u);
    expect(texts).toContain('Coupez les tiges les plus épaisses en deux dans la longueur.');
    expect(texts.join(' ')).toContain('blagues au milieu d’une recette');
    // The word cut at the end of a line is whole again.
    expect(texts).toContain('Prélevez un peu d’eau de cuisson des pâtes dans une tasse.');
    expect(d.ingredients).toHaveLength(5);
    expect(d.title).toBe('Pâtes aux broccolinis et parmesan');
    expect(d.servings).toBe(4);
  });

  it('numbered steps stay apart even when a line fills the column', () => {
    const lines = page([
      para(['1. Préchauffez le four à 180 °C et beurrez un moule rond de 22 cm de diamètre']),
      para(['2. Mélangez la farine, le sucre et la levure dans un grand saladier avec soin']),
    ]).map((l) => ({ ...l, width: 0.84 }));
    expect(paragraphsFromLines(lines).split('\n')).toHaveLength(2);
  });

  it('ingredients in a list of lines as wide as each other are not joined', () => {
    const lines = page([
      {
        x: 0.08,
        width: 0.4,
        lines: ['200 g de farine de blé', '100 g de sucre en poudre', '3 œufs entiers bien frais'],
      },
    ]);
    expect(paragraphsFromLines(lines).split('\n')).toHaveLength(3);
  });

  it('two columns side by side are not mixed', () => {
    const lines: PlacedLine[] = [
      {
        text: 'Faites fondre le beurre avec le chocolat au bain-marie',
        x: 0.5,
        y: 0.1,
        width: 0.45,
        height: 0.025,
      },
      { text: '200 g de chocolat noir à pâtisser', x: 0.05, y: 0.135, width: 0.4, height: 0.025 },
    ];
    expect(paragraphsFromLines(lines).split('\n')).toHaveLength(2);
  });

  it('without positions or headings, a line going on with the sentence stays in its step', () => {
    const d = parseRecipeText(
      [
        'Pâtes aux broccolinis',
        '400 g de pâtes',
        '300 g de broccolinis',
        'Plongez les pâtes dans l’eau bouillante. J’adore les petites blagues au',
        'milieu d’une recette. Prélevez un peu d’eau de cuisson des',
        'pâtes dans une tasse, puis égouttez les broccolinis et les',
        'pâtes.',
        'Servez aussitôt avec du parmesan râpé.',
      ].join('\n'),
    );
    // No step cut in the middle of a sentence.
    for (const st of d.steps) expect(st.text).toMatch(/[.!?]$/);
    expect(d.steps.map((x) => x.text).join(' ')).toContain('blagues au milieu d’une recette');
  });

  it('lines without positions: one per line, as before', () => {
    expect(
      paragraphsFromLines([
        { text: 'a b c d e', x: 0, y: 0, width: 0, height: 0 },
        { text: 'f g', x: 0, y: 0, width: 0, height: 0 },
      ]),
    ).toBe('a b c d e\nf g');
  });
});
