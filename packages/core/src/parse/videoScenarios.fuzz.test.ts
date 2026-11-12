/**
 * Every kind of recipe video, generated: a real recipe is spread at random over the post, the
 * text written on the video and what is said — ingredients in one, two or three of them, the
 * same for the steps, or nowhere — with what real videos add: captions written in every style
 * (lists, one line, emoji bullets, "Farine : 200 g", one paragraph), hashtags, a story, "link in
 * bio"; text on the video misread, in capitals, cut over two lines, the account name and
 * counters filmed with it; speech with numbers said in words, no punctuation, greetings and
 * calls to subscribe. The fused recipe must find what is there and invent nothing.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { casesRun, rng } from '../fuzz/rng';
import { ingredientKey } from '../text';
import { unflattenCaption } from './social';
import { isCookingStep } from './transcript';
import { parseRecipeText } from './text';
import {
  contentWords,
  fuseVideoRecipe,
  recipeLooksComplete,
  type ScreenFrame,
  type SpeechSegment,
} from './videoFusion';

type Lang = 'fr' | 'en';
interface Truth {
  lang: Lang;
  title: string;
  ingredients: [number | null, string | null, string][];
  steps: string[];
}

const RECIPES: Truth[] = [
  {
    lang: 'fr',
    title: 'Pâtes carbonara',
    ingredients: [
      [200, 'g', 'spaghetti'],
      [100, 'g', 'pancetta'],
      [2, null, 'jaunes d’œufs'],
      [50, 'g', 'pecorino'],
      [null, null, 'poivre'],
    ],
    steps: [
      'Faire cuire les spaghetti dans l’eau bouillante salée.',
      'Faire dorer la pancetta dans une poêle.',
      'Mélanger les jaunes d’œufs avec le pecorino.',
      'Mélanger les spaghetti avec la pancetta et les œufs hors du feu.',
    ],
  },
  {
    lang: 'fr',
    title: 'Cookies au chocolat',
    ingredients: [
      [125, 'g', 'beurre'],
      [100, 'g', 'sucre roux'],
      [1, null, 'œuf'],
      [200, 'g', 'farine'],
      [150, 'g', 'pépites de chocolat'],
    ],
    steps: [
      'Mélanger le beurre mou avec le sucre roux.',
      'Ajouter l’œuf puis la farine.',
      'Incorporer les pépites de chocolat.',
      'Former des boules et cuire 10 minutes à 180 °C.',
    ],
  },
  {
    lang: 'fr',
    title: 'Poulet au curry',
    ingredients: [
      [500, 'g', 'blancs de poulet'],
      [1, null, 'oignon'],
      [2, 'c. à soupe', 'curry'],
      [40, 'cl', 'lait de coco'],
      [1, null, 'citron vert'],
    ],
    steps: [
      'Faire revenir l’oignon émincé dans un filet d’huile.',
      'Ajouter le poulet coupé en morceaux et le faire dorer.',
      'Verser le curry et le lait de coco puis laisser mijoter 15 minutes.',
      'Arroser de jus de citron vert avant de servir.',
    ],
  },
  {
    lang: 'fr',
    title: 'Gratin dauphinois',
    ingredients: [
      [1, 'kg', 'pommes de terre'],
      [50, 'cl', 'crème liquide'],
      [25, 'cl', 'lait'],
      [2, null, 'gousses d’ail'],
      [null, null, 'muscade'],
    ],
    steps: [
      'Éplucher et couper les pommes de terre en fines rondelles.',
      'Faire chauffer la crème et le lait avec l’ail.',
      'Disposer les pommes de terre dans un plat et verser la crème.',
      'Cuire 1 heure au four à 160 °C.',
    ],
  },
  {
    lang: 'fr',
    title: 'Velouté de potiron',
    ingredients: [
      [1, 'kg', 'potiron'],
      [2, null, 'pommes de terre'],
      [1, null, 'oignon'],
      [1, 'l', 'bouillon de légumes'],
      [10, 'cl', 'crème'],
    ],
    steps: [
      'Couper le potiron et les pommes de terre en morceaux.',
      'Faire revenir l’oignon dans une casserole.',
      'Ajouter les légumes et le bouillon puis laisser cuire 25 minutes.',
      'Mixer avec la crème jusqu’à obtenir un velouté.',
    ],
  },
  {
    lang: 'fr',
    title: 'Crêpes',
    ingredients: [
      [250, 'g', 'farine'],
      [4, null, 'œufs'],
      [50, 'cl', 'lait'],
      [50, 'g', 'beurre fondu'],
      [1, 'pincée', 'sel'],
    ],
    steps: [
      'Verser la farine dans un saladier et creuser un puits.',
      'Ajouter les œufs puis le lait petit à petit en fouettant.',
      'Incorporer le beurre fondu et laisser reposer la pâte 30 minutes.',
      'Faire cuire les crêpes dans une poêle chaude.',
    ],
  },
  {
    lang: 'en',
    title: 'Banana bread',
    ingredients: [
      [3, null, 'ripe bananas'],
      [75, 'g', 'melted butter'],
      [150, 'g', 'sugar'],
      [1, null, 'egg'],
      [190, 'g', 'flour'],
    ],
    steps: [
      'Mash the bananas in a large bowl.',
      'Stir in the melted butter, the sugar and the egg.',
      'Fold in the flour until just combined.',
      'Pour into a loaf tin and bake for 50 minutes at 175 °C.',
    ],
  },
  {
    lang: 'en',
    title: 'Garlic butter shrimp',
    ingredients: [
      [400, 'g', 'shrimp'],
      [3, null, 'garlic cloves'],
      [40, 'g', 'butter'],
      [1, null, 'lemon'],
      [null, null, 'parsley'],
    ],
    steps: [
      'Melt the butter in a large pan over medium heat.',
      'Add the minced garlic and cook for 1 minute.',
      'Add the shrimp and cook until pink on both sides.',
      'Squeeze the lemon over the shrimp and sprinkle with parsley.',
    ],
  },
];

const HOOKS: Record<Lang, string[]> = {
  fr: [
    'Vous allez adorer 😍',
    'La recette qui rend fou 🤯',
    'Mon péché mignon ❤️',
    'POV : tu as faim',
  ],
  en: ['You NEED to try this 😍', 'Best thing I ever made 🤯', 'POV: you are hungry'],
};
const STORY: Record<Lang, string[]> = {
  fr: [
    'Ma grand-mère me faisait ça le dimanche, je vous partage enfin la recette ❤️',
    'Testé et approuvé par toute la famille !',
    'Dites-moi en commentaire si vous testez 👇',
  ],
  en: [
    'My grandma used to make this every Sunday ❤️',
    'Tested and approved by the whole family!',
    'Let me know in the comments if you try it 👇',
  ],
};
const TAGS: Record<Lang, string> = {
  fr: '#recette #faitmaison #cuisine #foodtok #recettefacile',
  en: '#recipe #homemade #foodtok #easyrecipe #cooking',
};
const HELLO: Record<Lang, string[]> = {
  fr: [
    'Salut tout le monde, aujourd’hui je vous montre une recette trop bonne.',
    'Coucou les amis !',
  ],
  en: ['Hey guys, today I am showing you an amazing recipe.', 'Hi everyone!'],
};
const BYE: Record<Lang, string[]> = {
  fr: [
    'Abonnez-vous pour plus de recettes et à demain !',
    'Franchement c’est une tuerie, dites-moi ce que vous en pensez.',
  ],
  en: [
    'Follow for more recipes and see you tomorrow!',
    'Honestly this is so good, let me know what you think.',
  ],
};
const NUM_WORDS: Record<Lang, Record<number, string>> = {
  fr: {
    1: 'un',
    2: 'deux',
    3: 'trois',
    4: 'quatre',
    10: 'dix',
    50: 'cinquante',
    100: 'cent',
    200: 'deux cents',
    250: 'deux cent cinquante',
  },
  en: {
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    10: 'ten',
    100: 'one hundred',
    200: 'two hundred',
  },
};
const UNIT_SAID: Record<Lang, Record<string, string>> = {
  fr: {
    g: 'grammes',
    kg: 'kilo',
    cl: 'centilitres',
    l: 'litre',
    'c. à soupe': 'cuillères à soupe',
    pincée: 'pincée',
  },
  en: { g: 'grams', kg: 'kilo', cl: 'centiliters', l: 'liter' },
};

type Where = 'caption' | 'screen' | 'speech';
const PLACES: Where[][] = [
  ['caption'],
  ['screen'],
  ['speech'],
  ['caption', 'screen'],
  ['caption', 'speech'],
  ['screen', 'speech'],
  ['caption', 'screen', 'speech'],
];

const amount = (q: number | null, u: string | null) => [q, u].filter((x) => x !== null).join(' ');
const ingLine = (i: Truth['ingredients'][number], lang: Lang) => {
  const [q, u, n] = i;
  if (q === null) return n;
  if (u === null) return `${q} ${n}`;
  return lang === 'fr'
    ? `${q} ${u} de ${n}`.replace(/de ([aeiouyhéœ])/i, 'd’$1')
    : `${q} ${u} ${n}`;
};

/** Text read badly: letters swapped like a text reader does, accents lost, capitals. */
function misread(r: ReturnType<typeof rng>, text: string): string {
  let t = text;
  if (r.bool(0.3)) t = t.toUpperCase();
  if (r.bool(0.3)) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (r.bool(0.25)) {
    const swaps: [RegExp, string][] = [
      [/i/, 'l'],
      [/m/, 'rn'],
      [/o/, '0'],
      [/e/, 'c'],
      [/a/, 'à'],
    ];
    const [re, by] = r.pick(swaps);
    const words = t.split(' ');
    const k = r.int(0, words.length - 1);
    if (words[k]!.length > 4) words[k] = words[k]!.replace(re, by);
    t = words.join(' ');
  }
  return t;
}

function caption(r: ReturnType<typeof rng>, t: Truth, ings: boolean, steps: boolean): string {
  const L = t.lang;
  const head =
    L === 'fr'
      ? r.pick(['Ingrédients :', 'INGRÉDIENTS', '🛒 Ingrédients', 'Pour 4 personnes :'])
      : r.pick(['Ingredients:', 'INGREDIENTS', '🛒 You need:']);
  const method =
    L === 'fr'
      ? r.pick(['Préparation :', 'Étapes :', 'RECETTE 👇'])
      : r.pick(['Method:', 'Steps:', 'Instructions:']);
  const parts: string[] = [r.bool(0.6) ? r.pick(HOOKS[L]) : t.title];
  if (r.bool(0.5)) parts.push(r.pick(STORY[L]));
  if (ings) {
    const style = r.int(0, 4);
    const lines = t.ingredients.map((i) => ingLine(i, L));
    // Only the names: the quantities are on the video or said.
    if (style === 4) parts.push(`${head}\n${t.ingredients.map((i) => `- ${i[2]}`).join('\n')}`);
    else if (style === 0) parts.push(`${head}\n${lines.map((l) => `- ${l}`).join('\n')}`);
    else if (style === 1)
      parts.push(
        `${head}\n${lines.map((l) => `${r.pick(['🧈', '🥚', '🧄', '🍝', '▪️', '•'])} ${l}`).join('\n')}`,
      );
    else if (style === 2) parts.push(`${head} ${lines.join(', ')}`);
    // "Farine : 200 g": the name first.
    else if (style === 3)
      parts.push(
        `${head}\n${t.ingredients.map(([q, u, n]) => (q === null ? n : `${n} : ${amount(q, u)}`)).join('\n')}`,
      );
  }
  if (steps) {
    const style = r.int(0, 3);
    if (style === 0) parts.push(`${method}\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    else if (style === 1)
      parts.push(
        `${method}\n${t.steps.map((s, i) => `${['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][i]} ${s}`).join('\n')}`,
      );
    else if (style === 2) parts.push(`${method}\n${t.steps.join(' ')}`);
    else parts.push(`${method}\n${t.steps.map((s) => `👉 ${s}`).join('\n')}`);
  }
  if (r.bool(0.5))
    parts.push(
      L === 'fr'
        ? 'Recette complète en commentaire / lien en bio 🔗'
        : 'Full recipe in the comments / link in bio 🔗',
    );
  parts.push(TAGS[L]);
  return parts.join('\n\n');
}

function screen(
  r: ReturnType<typeof rng>,
  t: Truth,
  ings: boolean,
  steps: boolean,
  duration: number,
): ScreenFrame[] {
  interface Shown {
    text: string;
    from: number;
    to: number;
    y: number;
  }
  const shown: Shown[] = [
    { text: '@chef_du_dimanche', from: 0, to: duration, y: 0.9 },
    { text: r.pick(['Suivre', 'Follow']), from: 0, to: duration, y: 0.94 },
    { text: `${r.int(1, 99)},${r.int(1, 9)} k`, from: 0, to: duration, y: 0.55 },
  ];
  if (r.bool(0.6)) shown.push({ text: t.title.toUpperCase(), from: 0, to: 4, y: 0.12 });
  if (ings) {
    // All at once as a list, or one by one as they are added.
    const together = r.bool(0.5);
    t.ingredients.forEach((i, k) => {
      if (i[0] === null && r.bool(0.5)) return; // "sel, poivre" often not written
      const from = together ? 2 : 2 + k * 4;
      shown.push({
        text: ingLine(i, t.lang),
        from,
        to: from + (together ? 6 : 3),
        y: together ? 0.25 + k * 0.06 : 0.3,
      });
    });
  }
  if (steps) {
    const start = ings ? 6 + t.ingredients.length * 4 : 4;
    t.steps.forEach((s, k) => {
      const from = start + k * 6;
      const text = r.bool(0.5) ? `${k + 1}. ${s}` : s;
      shown.push({ text, from, to: from + 4, y: 0.2 });
    });
  }
  const frames: ScreenFrame[] = [];
  for (let time = 1; time < duration; time += 2)
    frames.push({
      time,
      lines: shown
        .filter((s) => time >= s.from && time <= s.to)
        .flatMap((s) => {
          const text = r.bool(0.2) ? misread(r, s.text) : s.text;
          // A long overlay written over two lines.
          const words = text.split(' ');
          const cut = words.length > 6 && r.bool(0.4) ? Math.ceil(words.length / 2) : 0;
          const lines = cut ? [words.slice(0, cut).join(' '), words.slice(cut).join(' ')] : [text];
          return lines.map((l, k) => ({
            text: l,
            confidence: r.pick([0.5, 0.7, 0.9, 1]),
            x: 0.1,
            y: s.y + k * 0.045,
            width: Math.min(0.8, 0.018 * l.length),
            height: 0.04,
          }));
        }),
    });
  return frames;
}

function speech(
  r: ReturnType<typeof rng>,
  t: Truth,
  ings: boolean,
  steps: boolean,
): SpeechSegment[] {
  const L = t.lang;
  const phrases: string[] = [r.pick(HELLO[L])];
  const say = (q: number | null) =>
    q !== null && r.bool(0.5) && NUM_WORDS[L][q] ? NUM_WORDS[L][q] : q === null ? '' : String(q);
  if (ings)
    for (const [q, u, n] of t.ingredients) {
      const qty = say(q);
      const unit = u ? (UNIT_SAID[L][u] ?? u) : '';
      const link = L === 'fr' ? (u ? (/^[aeiouyhéœ]/i.test(n) ? 'd’' : 'de ') : '') : '';
      const body = `${[qty, unit].filter(Boolean).join(' ')} ${link}${n}`
        .replace(/\s+/g, ' ')
        .replace('d’ ', 'd’')
        .trim();
      phrases.push(
        L === 'fr'
          ? r.pick([`Il vous faut ${body}.`, `Alors on prend ${body}.`, `Ensuite ${body}.`])
          : r.pick([`You need ${body}.`, `Then ${body}.`]),
      );
    }
  if (steps)
    for (const s of t.steps) {
      const lower = s.charAt(0).toLowerCase() + s.slice(1);
      const lead =
        L === 'fr'
          ? r.pick(['', 'Alors ', 'Ensuite on va ', 'Et là il faut '])
          : r.pick(['', 'Now ', 'Then ']);
      // "Ensuite on va faire cuire…": the infinitive after "on va" keeps the sentence an order.
      phrases.push(lead ? `${lead}${lower}` : s);
      if (r.bool(0.2))
        phrases.push(
          L === 'fr'
            ? 'Regardez cette texture, c’est trop beau.'
            : 'Look at that texture, so good.',
        );
    }
  phrases.push(r.pick(BYE[L]));
  // No punctuation at all sometimes (the phone's recognition), lower case.
  const bare = r.bool(0.3);
  return phrases.map((p, i) => ({
    text: bare ? p.replace(/[.!,]/g, '').toLowerCase() : p,
    start: i * 4,
    end: i * 4 + 3.5,
    confidence: 0.8,
  }));
}

// --- Scoring ----------------------------------------------------------------------------------

const same = (a: string, b: string) => {
  const ka = ingredientKey(a);
  const kb = ingredientKey(b);
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const wa = contentWords(a);
  const wb = contentWords(b);
  return wa.length > 0 && wa.some((w) => wb.includes(w));
};
const NOISE =
  /chef_du_dimanche|suivre|follow|#|lien en bio|link in bio|abonnez|commentaire|comments|\d+,\d k/i;

interface Score {
  klass: string;
  ingRecall: number;
  ingPrecision: number;
  qtyOk: number;
  qtyTotal: number;
  stepRecall: number;
  noise: string[];
  seed: number;
}

const N = 1200;
const results: Score[] = [];

function run(seed: number): Score {
  const r = rng(seed);
  const t = r.pick(RECIPES);
  let ingAt = r.pick(PLACES);
  let stepAt = r.pick(PLACES);
  // Music only, nobody speaks (and then nothing is said: what was to be said is written).
  const mute = r.bool(0.12);
  if (mute) {
    if (ingAt.includes('speech'))
      ingAt = ingAt.length > 1 ? ingAt.filter((x) => x !== 'speech') : ['screen'];
    if (stepAt.includes('speech'))
      stepAt = stepAt.length > 1 ? stepAt.filter((x) => x !== 'speech') : ['screen'];
  }
  const text = caption(r, t, ingAt.includes('caption'), stepAt.includes('caption'));
  const parsed = parseRecipeText(unflattenCaption(text));
  const draft = {
    ...parsed,
    steps: parsed.steps.filter((s) => !/https?:|www\.|link in bio|lien en bio/i.test(s.text)),
  };
  const duration = 60;
  const fused = fuseVideoRecipe({
    caption: draft,
    screen: screen(r, t, ingAt.includes('screen'), stepAt.includes('screen'), duration),
    speech: mute ? [] : speech(r, t, ingAt.includes('speech'), stepAt.includes('speech')),
  }).draft;
  const got = fused.ingredients.map((i) => i.name);
  if (process.env.DEBUG_VIDEO && ingAt.join() === 'caption' && seed < 400) {
    const missed = t.ingredients.filter(
      (i) => i[0] !== null && !fused.ingredients.some((g) => same(g.name, i[2])),
    );
    if (missed.length)
      console.info(
        `\n#${seed} missed ${missed.map((m) => m[2]).join(', ')}\n--- caption\n${text}\n--- parsed ${JSON.stringify(parsed.ingredients.map((i) => i.name))}`,
      );
  }
  const want = t.ingredients.map((i) => i[2]);
  // "sel, poivre" without a quantity are not always written: not counted as missed.
  const must = t.ingredients.filter((i) => i[0] !== null);
  const ingRecall = must.filter((i) => got.some((g) => same(g, i[2]))).length / must.length;
  const ingPrecision = got.length
    ? got.filter((g) => want.some((w) => same(g, w))).length / got.length
    : 1;
  // A quantity written (post or video) must be the one kept.
  let qtyOk = 0;
  let qtyTotal = 0;
  // Names only in the caption: its quantities are not a written source.
  const namesOnly = /\n- [^\d\n]+\n- [^\d\n]+(\n|$)/.test(text);
  if ((ingAt.includes('caption') && !namesOnly) || ingAt.includes('screen'))
    for (const [q, , n] of must) {
      const f = fused.ingredients.find((i) => same(i.name, n));
      qtyTotal++;
      if (f && f.quantity === q) qtyOk++;
    }
  const stepsText = fused.steps.map((s) => contentWords(s.text));
  if (process.env.DEBUG_STEPS)
    for (const s of t.steps) {
      const ws = contentWords(s);
      if (
        !stepsText.some((g) => ws.filter((w) => g.includes(w)).length >= Math.ceil(ws.length * 0.6))
      )
        console.info(`MISSED [${stepAt.join('+')}] ${s}`);
    }
  const stepRecall =
    t.steps.filter((s) => {
      const ws = contentWords(s);
      return stepsText.some(
        (g) => ws.filter((w) => g.includes(w)).length >= Math.ceil(ws.length * 0.6),
      );
    }).length / t.steps.length;
  const noise = [...got, ...fused.steps.map((s) => s.text)].filter((x) => NOISE.test(x));
  return {
    klass: `ingr:${ingAt.join('+')} steps:${stepAt.join('+')}${mute ? ' (music)' : ''}`,
    ingRecall,
    ingPrecision,
    qtyOk,
    qtyTotal,
    stepRecall,
    noise,
    seed,
  };
}

describe('every kind of recipe video', () => {
  it(`${N} generated videos: what is there is found, nothing is invented`, () => {
    for (let seed = 1; seed <= N; seed++) results.push(run(seed));
    const avg = (f: (s: Score) => number, list = results) =>
      list.reduce((n, s) => n + f(s), 0) / list.length;
    const byClass = new Map<string, Score[]>();
    for (const s of results) byClass.set(s.klass, [...(byClass.get(s.klass) ?? []), s]);
    const table = [...byClass.entries()]
      .map(([k, l]) => ({
        k,
        n: l.length,
        ing: avg((s) => s.ingRecall, l),
        prec: avg((s) => s.ingPrecision, l),
        qty:
          l.reduce((n, s) => n + s.qtyOk, 0) /
          Math.max(
            1,
            l.reduce((n, s) => n + s.qtyTotal, 0),
          ),
        steps: avg((s) => s.stepRecall, l),
      }))
      .sort((a, b) => a.ing + a.steps - (b.ing + b.steps));
    console.info(
      table
        .slice(0, 12)
        .map(
          (x) =>
            `${x.k.padEnd(48)} n=${String(x.n).padStart(3)} ingr ${x.ing.toFixed(2)} prec ${x.prec.toFixed(2)} qty ${x.qty.toFixed(2)} steps ${x.steps.toFixed(2)}`,
        )
        .join('\n'),
    );
    const qty =
      results.reduce((n, s) => n + s.qtyOk, 0) / results.reduce((n, s) => n + s.qtyTotal, 0);
    const summary = {
      ing: avg((s) => s.ingRecall),
      prec: avg((s) => s.ingPrecision),
      qty,
      steps: avg((s) => s.stepRecall),
      noise: results.filter((s) => s.noise.length).map((s) => `${s.seed}: ${s.noise.join(' | ')}`),
    };
    console.info(JSON.stringify(summary));
    expect(summary.noise).toEqual([]);
    expect(summary.ing).toBeGreaterThanOrEqual(0.95);
    expect(summary.prec).toBeGreaterThanOrEqual(0.95);
    expect(summary.qty).toBeGreaterThanOrEqual(0.95);
    expect(summary.steps).toBeGreaterThanOrEqual(0.9);
    // No kind of video is left behind.
    for (const x of table) {
      expect(x.ing, x.k).toBeGreaterThanOrEqual(0.85);
      expect(x.steps, x.k).toBeGreaterThanOrEqual(0.8);
    }
  }, 120_000);

  it('a caption with ingredients but no quantities, or one vague step, is not "complete"', () => {
    const vague = parseRecipeText(
      'Pâtes au pesto\nIngrédients :\n- pâtes\n- pesto\n- parmesan\n\nMélangez tout et régalez-vous !',
    );
    expect(recipeLooksComplete(vague)).toBe(false);
    const full = parseRecipeText(
      'Crêpes\nIngrédients :\n- 250 g de farine\n- 4 œufs\n- 50 cl de lait\n\nPréparation :\n1. Mélanger la farine et les œufs.\n2. Ajouter le lait petit à petit.\n3. Faire cuire dans une poêle chaude.',
    );
    expect(recipeLooksComplete(full)).toBe(true);
  });
});

afterAll(() => console.info(`QA-COUNT core.fuzz.videos.cases ${casesRun()}`));

describe('captions written every way (found by the generator)', () => {
  const names = (t: string) =>
    parseRecipeText(unflattenCaption(t)).ingredients.map((i) => [i.quantity, i.name]);
  it('a list on one line, with or without a colon, in French and English', () => {
    const want = [
      [250, 'farine'],
      [4, 'œufs'],
      [50, 'lait'],
    ];
    expect(
      names('Crêpes\n\nIngrédients : 250 g de farine, 4 œufs, 50 cl de lait\n\n#recette'),
    ).toEqual(want);
    expect(names('Crêpes\n\n🛒 Ingrédients 250 g de farine, 4 œufs, 50 cl de lait')).toEqual(want);
    expect(
      names(
        'POV : tu as faim\n\nIngrédients : 250 g de farine, 4 œufs, 50 cl de lait\n\n#recette #faitmaison',
      ),
    ).toEqual(want);
    expect(names('Banana bread\n\n🛒 You need: 3 ripe bananas, 150 g sugar, 1 egg')).toEqual([
      [3, 'ripe bananas'],
      [150, 'sugar'],
      [1, 'egg'],
    ]);
    // A decimal comma is not a separator.
    expect(names('Ingrédients : 1,5 kg de pommes de terre, 2 oignons')).toEqual([
      [1.5, 'pommes de terre'],
      [2, 'oignons'],
    ]);
  });

  it('"Pour 4 personnes :" opens the list (and gives the servings)', () => {
    const d = parseRecipeText(
      'Carbonara\n\nPour 4 personnes :\nspaghetti : 200 g\npancetta : 100 g\njaunes d’œufs : 2',
    );
    expect(d.servings).toBe(4);
    expect(d.ingredients.map((i) => [i.quantity, i.name])).toEqual([
      [200, 'spaghetti'],
      [100, 'pancetta'],
      [2, 'jaunes d’œufs'],
    ]);
  });

  it('"link in bio", "recette complète en commentaire" stay in the notes', () => {
    const d = parseRecipeText(
      'Cookies\nIngrédients :\n- 200 g de farine\n- 100 g de beurre\nRecette complète en commentaire / lien en bio 🔗',
    );
    expect(d.ingredients.map((i) => i.name)).toEqual(['farine', 'beurre']);
    expect(d.notes).toContain('lien en bio');
  });

  it('"Préparation : 20 min" stays a time, "Préparation : Mélanger…" is the method', () => {
    expect(parseRecipeText('Gâteau\nPréparation : 20 min\nCuisson : 30 min').prepMinutes).toBe(20);
    const d = parseRecipeText(
      'Gâteau\nIngrédients :\n- 200 g de farine\nPréparation : Mélanger la farine avec le sucre puis cuire 30 minutes.',
    );
    expect(d.steps).toHaveLength(1);
  });

  it('nouns that look like verbs are not instructions ("ma poêle", "la farine", "brown sugar")', () => {
    expect(isCookingStep('ma poêle était trop chaude mais sinon c’est très bon')).toBe(false);
    expect(isCookingStep('alors on commence avec 200 grammes de farine')).toBe(false);
    expect(isCookingStep('Abonnez-vous pour plus de recettes et à demain')).toBe(false);
    expect(isCookingStep('Arroser de jus de citron vert avant de servir.')).toBe(true);
    expect(isCookingStep('Mash the bananas in a large bowl.')).toBe(true);
  });
});
