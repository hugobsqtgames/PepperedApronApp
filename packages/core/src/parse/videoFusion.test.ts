import { describe, expect, it } from 'vitest';
import { emptyDraft, type RecipeDraft } from './draft';
import { ingredientsFromScreenText } from './onscreen';
import { takeSpokenSteps, recipeFromTranscript } from './transcript';
import { ingredientKey } from '../text';
import {
  chooseVideoRecipe,
  fuseVideoRecipe,
  groundModelRecipe,
  modelPrompt,
  trackScreenText,
  type ScreenFrame,
  type SpeechSegment,
  type VideoEvidence,
} from './videoFusion';

// --- Simulated videos ---------------------------------------------------------------------------

interface Shown {
  text: string;
  from: number;
  to: number;
  y: number;
  /** Readings of some pictures that go wrong ("farlne"). */
  misread?: string;
  confidence?: number;
}

/** One picture every 2 s of a `duration` s video, with the texts shown at that time. */
function frames(duration: number, shown: Shown[]): ScreenFrame[] {
  const out: ScreenFrame[] = [];
  for (let t = 1, i = 0; t < duration; t += 2, i++)
    out.push({
      time: t,
      lines: shown
        .filter((s) => t >= s.from && t <= s.to)
        .map((s) => ({
          text: s.misread && i % 3 === 0 ? s.misread : s.text,
          confidence: s.confidence ?? 0.9,
          x: 0.1,
          // Each text on its own place, far from the others: one text per block.
          y: s.y,
          width: Math.min(0.8, 0.02 * s.text.length),
          height: 0.04,
        })),
    });
  return out;
}

/** What is said, one phrase every 4 s. */
const speech = (...phrases: string[]): SpeechSegment[] =>
  phrases.map((text, i) => ({ text, start: i * 4, end: i * 4 + 3.5, confidence: 0.9 }));

const caption = (p: Partial<RecipeDraft>): RecipeDraft => ({ ...emptyDraft(), ...p });
const ing = (quantity: number | null, unit: string | null, name: string) => ({
  group: null,
  name,
  quantity,
  quantityMax: null,
  unit,
  note: null,
});

const watermark: Shown[] = [
  { text: '@cuisine_de_lea', from: 0, to: 99, y: 0.92 },
  { text: 'Suivre', from: 0, to: 99, y: 0.95 },
  { text: '12,4 k', from: 0, to: 99, y: 0.6 },
];

interface Case {
  name: string;
  evidence: VideoEvidence;
  ingredients: string[];
  /** Quantities expected for some ingredients (name → quantity). */
  quantities?: Record<string, number>;
  /** Words each expected step must contain, in order. */
  steps: string[][];
  title?: string;
}

const CASES: Case[] = [
  {
    name: 'caption of hashtags, quantities written on the video, method said',
    evidence: {
      caption: caption({ title: 'Vous allez adorer 😍', description: '#pasta #recette #foodtok' }),
      screen: frames(40, [
        ...watermark,
        { text: '200 g de pâtes', from: 2, to: 8, y: 0.3 },
        { text: '150 g de lardons', from: 2, to: 8, y: 0.36 },
        {
          text: '20 cl de crème fraîche',
          from: 2,
          to: 8,
          y: 0.42,
          misread: '20 cl de creme fralche',
        },
        { text: '50 g de parmesan', from: 2, to: 8, y: 0.48 },
      ]),
      speech: speech(
        'Salut tout le monde, aujourd’hui je vous fais des pâtes à la crème.',
        'Faites cuire les pâtes 10 minutes dans l’eau bouillante salée.',
        'Pendant ce temps faites revenir les lardons dans une poêle.',
        'Ajoutez la crème fraîche et le parmesan, mélangez bien.',
        'Égouttez les pâtes et versez-les dans la sauce.',
        'Abonnez-vous pour plus de recettes !',
      ),
    },
    ingredients: ['pâtes', 'lardons', 'crème fraîche', 'parmesan'],
    quantities: { lardons: 150, parmesan: 50, 'crème fraîche': 20 },
    steps: [
      ['cuire', 'pate'],
      ['revenir', 'lardon'],
      ['creme', 'parmesan'],
      ['egoutte', 'sauce'],
    ],
  },
  {
    name: 'steps only written on the video, what is said is chatter',
    evidence: {
      caption: caption({
        title: 'Cookies',
        ingredients: [
          ing(200, 'g', 'farine'),
          ing(100, 'g', 'beurre'),
          ing(80, 'g', 'sucre'),
          ing(1, null, 'œuf'),
          ing(100, 'g', 'pépites de chocolat'),
        ],
      }),
      screen: frames(36, [
        ...watermark,
        { text: '1. Mélanger le beurre mou et le sucre', from: 3, to: 8, y: 0.2 },
        { text: '2. Ajouter l’œuf puis la farine', from: 9, to: 14, y: 0.2 },
        { text: '3. Incorporer les pépites de chocolat', from: 15, to: 20, y: 0.2 },
        { text: '4. Cuire 10 min à 180°C', from: 21, to: 27, y: 0.2 },
      ]),
      speech: speech(
        'Coucou les amis, c’est la recette préférée de mes enfants.',
        'Franchement c’est trop bon, dites-moi en commentaire si vous testez.',
        'Allez on se retrouve demain pour une nouvelle vidéo.',
      ),
    },
    ingredients: ['farine', 'beurre', 'sucre', 'œuf', 'pépites de chocolat'],
    quantities: { farine: 200, beurre: 100 },
    steps: [['melanger', 'beurre'], ['oeuf', 'farine'], ['pepite'], ['cuire']],
  },
  {
    name: 'full caption: kept, confirmed by the video, a misheard quantity ignored',
    evidence: {
      caption: caption({
        title: 'Gâteau au yaourt',
        ingredients: [
          ing(200, 'g', 'farine'),
          ing(1, null, 'yaourt nature'),
          ing(3, null, 'œufs'),
          ing(150, 'g', 'sucre'),
        ],
        steps: [
          {
            group: null,
            text: 'Mélanger le yaourt, le sucre et les œufs.',
            timerSeconds: null,
            timerLabel: null,
          },
          {
            group: null,
            text: 'Ajouter la farine et mélanger.',
            timerSeconds: null,
            timerLabel: null,
          },
          { group: null, text: 'Cuire 35 minutes à 180 °C.', timerSeconds: 2100, timerLabel: null },
        ],
      }),
      screen: frames(30, [...watermark, { text: '200 g de farine', from: 3, to: 9, y: 0.3 }]),
      speech: speech(
        'On met deux cent cinquante grammes de farine, non pardon deux cents.',
        'On mélange le yaourt avec le sucre et les œufs.',
        'Ensuite on ajoute la farine et on mélange.',
        'Et hop au four 35 minutes.',
      ),
    },
    ingredients: ['farine', 'yaourt nature', 'œufs', 'sucre'],
    quantities: { farine: 200, sucre: 150 },
    steps: [['yaourt', 'sucre'], ['farine'], ['cuire']],
  },
  {
    name: 'a text misread on some pictures: the reading seen most wins',
    evidence: {
      caption: caption({ title: 'Crêpes' }),
      screen: frames(30, [
        ...watermark,
        { text: '250 g de farine', from: 1, to: 15, y: 0.3, misread: '250 g de farlne' },
        { text: '50 cl de lait', from: 1, to: 15, y: 0.36 },
        { text: '4 œufs', from: 1, to: 15, y: 0.42, misread: '4 oeufs.' },
      ]),
      speech: speech(
        'Versez la farine dans un saladier et creusez un puits.',
        'Ajoutez les œufs puis le lait petit à petit en fouettant.',
        'Laissez reposer la pâte 30 minutes puis faites cuire les crêpes.',
      ),
    },
    ingredients: ['farine', 'lait', 'œufs'],
    quantities: { farine: 250, lait: 50, œufs: 4 },
    steps: [['farine', 'saladier'], ['oeuf', 'lait'], ['reposer']],
  },
  {
    name: 'everything said, the dish named on the first pictures',
    evidence: {
      caption: caption({ title: 'Le meilleur plat de ma vie !!' }),
      screen: frames(40, [...watermark, { text: 'POULET AU CURRY', from: 0, to: 5, y: 0.15 }]),
      speech: speech(
        'Pour ce poulet au curry il vous faut 500 grammes de poulet.',
        'Un oignon, deux cuillères à soupe de curry et 20 centilitres de lait de coco.',
        'Faites revenir l’oignon émincé dans un peu d’huile.',
        'Ajoutez le poulet coupé en morceaux et faites dorer 5 minutes.',
        'Ajoutez le curry et le lait de coco, laissez mijoter 15 minutes.',
      ),
    },
    ingredients: ['poulet', 'oignon', 'curry', 'lait de coco'],
    quantities: { poulet: 500 },
    steps: [
      ['revenir', 'oignon'],
      ['poulet', 'dorer'],
      ['curry', 'mijoter'],
    ],
    title: 'poulet au curry',
  },
  {
    name: 'the method said, one step only written on the video joins it in time order',
    evidence: {
      caption: caption({
        title: 'Soupe de potiron',
        ingredients: [
          ing(1, 'kg', 'potiron'),
          ing(1, null, 'oignon'),
          ing(1, 'l', 'bouillon'),
          ing(10, 'cl', 'crème'),
        ],
      }),
      screen: frames(40, [
        ...watermark,
        { text: 'Mixer finement avec la crème', from: 13, to: 17, y: 0.25 },
      ]),
      speech: speech(
        'Coupez le potiron en morceaux.',
        'Faites revenir l’oignon dans une casserole avec un filet d’huile.',
        'Ajoutez le potiron et le bouillon et laissez cuire 25 minutes.',
        'Je vous montre le résultat, regardez cette couleur.',
        'Servez bien chaud avec des graines de courge.',
      ),
    },
    ingredients: ['potiron', 'oignon', 'bouillon', 'crème'],
    steps: [
      ['coupe', 'potiron'],
      ['revenir', 'oignon'],
      ['bouillon', 'cuire'],
      ['mixer', 'creme'],
      ['servez'],
    ],
  },
];

// --- Scoring ------------------------------------------------------------------------------------

const has = (names: string[], want: string) =>
  names.some(
    (n) =>
      ingredientKey(n).includes(ingredientKey(want)) ||
      ingredientKey(want).includes(ingredientKey(n)),
  );

function ingredientF1(got: string[], want: string[]): number {
  if (!got.length || !want.length) return 0;
  const tp = want.filter((w) => has(got, w)).length;
  const precision = got.filter((g) => has(want, g)).length / got.length;
  const recall = tp / want.length;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

/** Share of the expected steps found, in order. */
function stepRecall(got: string[], want: string[][]): number {
  const norm = got.map((s) => ingredientKey(s));
  let at = 0;
  let found = 0;
  for (const words of want) {
    const k = norm.findIndex((s, i) => i >= at && words.every((w) => s.includes(w)));
    if (k >= 0) {
      found++;
      at = k + 1;
    }
  }
  return found / want.length;
}

/** The pipeline as it was: post, then ingredients written on the video, then steps said. */
function oldPipeline(ev: VideoEvidence): RecipeDraft {
  const draft = {
    ...ev.caption,
    ingredients: [...ev.caption.ingredients],
    steps: [...ev.caption.steps],
  };
  const screenIngs = ingredientsFromScreenText(ev.screen.map((f) => f.lines.map((l) => l.text)));
  for (const s of screenIngs)
    if (!draft.ingredients.some((i) => ingredientKey(i.name) === ingredientKey(s.name)))
      draft.ingredients.push(s);
  const spoken = recipeFromTranscript(ev.speech.map((s) => s.text));
  if (!ev.caption.ingredients.length)
    for (const s of spoken.ingredients)
      if (!draft.ingredients.some((i) => ingredientKey(i.name) === ingredientKey(s.name)))
        draft.ingredients.push(s);
  takeSpokenSteps(draft, spoken.steps);
  return draft;
}

// --- Tests --------------------------------------------------------------------------------------

describe('video fusion bench (simulated reels)', () => {
  const scores = CASES.map((c) => {
    const fused = fuseVideoRecipe(c.evidence);
    const old = oldPipeline(c.evidence);
    return {
      c,
      fused,
      newIng: ingredientF1(
        fused.draft.ingredients.map((i) => i.name),
        c.ingredients,
      ),
      oldIng: ingredientF1(
        old.ingredients.map((i) => i.name),
        c.ingredients,
      ),
      newSteps: stepRecall(
        fused.draft.steps.map((s) => s.text),
        c.steps,
      ),
      oldSteps: stepRecall(
        old.steps.map((s) => s.text),
        c.steps,
      ),
    };
  });

  for (const s of scores)
    it(s.c.name, () => {
      expect(s.newIng).toBeGreaterThanOrEqual(0.85);
      expect(s.newSteps).toBeGreaterThanOrEqual(0.75);
      for (const [name, q] of Object.entries(s.c.quantities ?? {})) {
        const found = s.fused.draft.ingredients.find((i) => has([i.name], name));
        expect(found?.quantity, name).toBe(q);
      }
      if (s.c.title) expect(s.fused.draft.title?.toLowerCase()).toContain(s.c.title);
      // The app's interface filmed with the video never becomes a recipe line.
      const all = [
        ...s.fused.draft.ingredients.map((i) => i.name),
        ...s.fused.draft.steps.map((x) => x.text),
      ].join(' ');
      expect(all).not.toMatch(/cuisine_de_lea|Suivre|12,4/);
    });

  it('does better than the old pipeline, never worse', () => {
    const avg = (k: 'newIng' | 'oldIng' | 'newSteps' | 'oldSteps') =>
      scores.reduce((n, s) => n + s[k], 0) / scores.length;
    for (const s of scores) {
      expect(s.newIng, s.c.name).toBeGreaterThanOrEqual(s.oldIng - 1e-9);
      expect(s.newSteps, s.c.name).toBeGreaterThanOrEqual(s.oldSteps - 1e-9);
    }
    expect(avg('newIng') + avg('newSteps')).toBeGreaterThan(avg('oldIng') + avg('oldSteps') + 0.2);
  });
});

describe('text on the video', () => {
  it('follows a text over pictures, sets the interface aside', () => {
    const t = trackScreenText(
      frames(20, [
        ...watermark,
        { text: '200 g de farine', from: 1, to: 9, y: 0.3, misread: '200 g de farlne' },
      ]),
    );
    const flour = t.filter((x) => x.kind === 'ingredient');
    expect(flour).toHaveLength(1);
    expect(flour[0]!.text).toBe('200 g de farine');
    expect(flour[0]!.frames).toBe(5);
    expect(t.filter((x) => x.kind === 'chrome').map((x) => x.text)).toEqual(
      expect.arrayContaining(['@cuisine_de_lea', 'Suivre', '12,4 k']),
    );
  });

  it('drops a text read once with doubt', () => {
    const t = trackScreenText(
      frames(10, [{ text: 'Mxrl qz', from: 1, to: 1, y: 0.5, confidence: 0.3 }]),
    );
    expect(t).toHaveLength(0);
  });
});

describe('the on-device model, checked against the video', () => {
  const ev = CASES[0]!.evidence;
  const fused = fuseVideoRecipe(ev);

  it('the prompt holds the three sources and fits the model', () => {
    const p = modelPrompt(ev, fused);
    expect(p).toContain('TEXTE ÉCRIT SUR LA VIDÉO');
    expect(p).toContain('150 g de lardons');
    expect(p).toContain('CE QUI EST DIT DANS LA VIDÉO');
    expect(p).not.toContain('cuisine_de_lea');
    const long = {
      ...ev,
      speech: speech(
        ...Array.from(
          { length: 400 },
          () => 'Faites revenir les lardons dans la poêle bien chaude.',
        ),
      ),
    };
    expect(modelPrompt(long, fuseVideoRecipe(long)).length).toBeLessThan(9500);
  });

  it('keeps what the sources say, drops what the model invented', () => {
    const g = groundModelRecipe(
      {
        title: 'Pâtes à la crème et aux lardons',
        servings: 4,
        ingredients: [
          { name: 'pâtes', quantity: '200', unit: 'g' },
          { name: 'lardons', quantity: '150', unit: 'g' },
          { name: 'persil frais', quantity: '1', unit: 'bouquet' },
          { name: 'sel', quantity: '1', unit: 'c. à café' },
        ],
        steps: [
          'Faire cuire les pâtes 10 minutes dans l’eau bouillante salée.',
          'Faire revenir les lardons dans une poêle.',
          'Préchauffer le four à 200 °C et enfourner le gratin.',
        ],
      },
      ev,
      fused,
    );
    // Neither parsley nor salt is in the post, on the video or said ("salée" is not "sel").
    expect(g.ingredients.map((i) => i.name)).toEqual(['pâtes', 'lardons']);
    expect(g.ingredients.find((i) => i.name === 'lardons')?.quantity).toBe(150);
    expect(g.steps).toHaveLength(2);
    expect(g.dropped).toEqual(expect.arrayContaining(['persil frais', 'sel']));
    expect(g.dropped.some((d) => /four/.test(d))).toBe(true);
    // 4 servings is said nowhere.
    expect(g.servings).toBeNull();
  });

  it('takes the model only where it is clearly better', () => {
    const weak = groundModelRecipe(
      {
        title: null,
        servings: null,
        ingredients: [{ name: 'pâtes', quantity: null, unit: null }],
        steps: ['Faire cuire les pâtes.'],
      },
      ev,
      fused,
    );
    expect(chooseVideoRecipe(fused, weak).fromModel).toEqual([]);
    const strong = groundModelRecipe(
      {
        title: 'Pâtes à la crème et aux lardons',
        servings: null,
        ingredients: [
          { name: 'pâtes', quantity: '200', unit: 'g' },
          { name: 'lardons', quantity: '150', unit: 'g' },
          { name: 'crème fraîche', quantity: '20', unit: 'cl' },
          { name: 'parmesan', quantity: '50', unit: 'g' },
        ],
        steps: [
          'Faire cuire les pâtes 10 minutes dans l’eau bouillante salée.',
          'Pendant ce temps, faire revenir les lardons dans une poêle.',
          'Ajouter la crème fraîche et le parmesan, bien mélanger.',
          'Égoutter les pâtes et les verser dans la sauce aux lardons.',
        ],
      },
      ev,
      fused,
    );
    const best = chooseVideoRecipe(fused, strong);
    expect(best.fromModel).toContain('ingredients');
    // The dish named in what is said is already a title: the model's does not replace it.
    expect(fused.report.titleFrom).toBe('speech');
    expect(best.draft.title?.toLowerCase()).toContain('pâtes à la crème');
    expect(best.draft.ingredients.find((i) => i.name === 'parmesan')?.quantity).toBe(50);
  });
});

describe('what is said', () => {
  it('a food named first without its quantity gets it from the next mention (feedback)', () => {
    const r = recipeFromTranscript(['Pour ce poulet au curry il vous faut 500 grammes de poulet.']);
    expect(r.ingredients.find((i) => i.name === 'poulet')).toMatchObject({
      quantity: 500,
      unit: 'g',
    });
    expect(r.ingredients.filter((i) => i.name === 'poulet')).toHaveLength(1);
  });
});
