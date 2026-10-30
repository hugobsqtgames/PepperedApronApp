import { detectStepTimer } from './steps';
import { singularize, tokenize } from './text';

const words = (s: string) =>
  s
    .split(',')
    .map((w) => tokenize(w.trim()).map(singularize))
    .filter((t) => t.length);

function hasAny(text: string, list: string[][]): boolean {
  const toks = tokenize(text).map(singularize);
  return list.some((p) => {
    for (let i = 0; i + p.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < p.length && ok; j++) ok = toks[i + j] === p[j];
      if (ok) return true;
    }
    return false;
  });
}

/** The cook can walk away: it bakes, simmers, rests, chills… */
const PASSIVE = words(
  'enfourner,four,mijoter,mijote,reposer,repos,refroidir,refrigerateur,frigo,mariner,lever,pousser,rotir,confire,gratiner,infuser,' +
    'bake,oven,simmer,rest,chill,fridge,refrigerate,marinate,rise,proof,roast,braise,cool,steep',
);
/** Hands-on preparation that can be done meanwhile. */
const PREP = words(
  'couper,emincer,hacher,eplucher,peler,raper,laver,rincer,preparer,melanger,fouetter,battre,tailler,ciseler,concasser,presser,zester,egoutter,mesurer,peser,dresser,assaisonner,' +
    'chop,slice,dice,mince,peel,grate,wash,rinse,prepare,mix,whisk,beat,cut,trim,zest,squeeze,drain,measure,weigh,season,toss',
);

/**
 * "While it cooks…": when step `index` leaves the cook free (a timer of 5 minutes or more, or a
 * baking / simmering / resting step), the next preparation steps that can be done meanwhile.
 * Stops at the first step that is itself passive (it needs the previous one finished).
 */
export function parallelSteps<T extends { text: string; timerSeconds: number | null }>(
  steps: T[],
  index: number,
): { index: number; step: T }[] {
  const cur = steps[index];
  if (!cur) return [];
  const timer = detectStepTimer(cur);
  const free =
    (timer !== null && timer >= 300) ||
    (hasAny(cur.text, PASSIVE) && (timer === null || timer >= 120));
  if (!free) return [];
  const out: { index: number; step: T }[] = [];
  for (let i = index + 1; i < steps.length && out.length < 2; i++) {
    const s = steps[i]!;
    if (hasAny(s.text, PASSIVE) || detectStepTimer(s)) break;
    if (hasAny(s.text, PREP)) out.push({ index: i, step: s });
    else break;
  }
  return out;
}

/**
 * Bases that are often left over and easy to reuse (cooked rice, pasta, chicken, potatoes…),
 * each with the words that find recipes using it.
 */
const BASES: { key: string; match: string[][] }[] = [
  { key: 'rice', match: words('riz,rice,risotto') },
  {
    key: 'pasta',
    match: words(
      'pate,pasta,spaghetti,penne,tagliatelle,fusilli,macaroni,coquillette,nouille,noodle',
    ),
  },
  { key: 'chicken', match: words('poulet,chicken,volaille') },
  { key: 'potato', match: words('pomme de terre,potato,patate') },
  { key: 'bread', match: words('pain,baguette,bread') },
  { key: 'beef', match: words('boeuf,beef,pot au feu,roti') },
  {
    key: 'vegetables',
    match: words(
      'legume,courgette,carotte,poivron,aubergine,brocoli,vegetable,zucchini,carrot,pepper,eggplant,broccoli',
    ),
  },
  { key: 'quinoa', match: words('quinoa,boulgour,bulgur,semoule,couscous') },
  { key: 'lentils', match: words('lentille,pois chiche,haricot,lentil,chickpea,bean') },
  { key: 'salmon', match: words('saumon,salmon,poisson,fish') },
];

/** Recipes made to use leftovers: fried rice, gratin, omelette, soup, pudding… */
const REUSE = words(
  'riz saute,riz frit,fried rice,cantonais,gratin,omelette,frittata,tortilla,soupe,veloute,soup,salade,salad,croquette,galette,hachis,parmentier,quiche,tarte,wrap,pudding,pain perdu,french toast,bowl,poke,curry,fajitas,taco,arancini,bruschetta,crouton,sandwich,pasta salad',
);

export interface LeftoverIdea<R> {
  /** Key of the leftover base (translated by the app): rice, pasta, chicken… */
  base: string;
  /** Recipes of the library that use it, best first. */
  recipes: R[];
}

/**
 * Leftovers of what was cooked or planned recently (yesterday's meals) and recipes to use them.
 * Recipes that look made for leftovers (gratin, fried rice, soup…) come first; the dishes just
 * eaten are not suggested again.
 */
export function leftoverIdeas<
  R extends { id: string; title: string; ingredients: { name: string }[] },
>(eaten: R[], library: R[], max = 3): LeftoverIdea<R>[] {
  const eatenIds = new Set(eaten.map((r) => r.id));
  const bases: string[] = [];
  for (const r of eaten)
    for (const b of BASES)
      if (!bases.includes(b.key) && r.ingredients.some((i) => hasAny(i.name, b.match)))
        bases.push(b.key);
  const out: LeftoverIdea<R>[] = [];
  for (const key of bases) {
    const base = BASES.find((b) => b.key === key)!;
    const recipes = library
      .filter((r) => !eatenIds.has(r.id) && r.ingredients.some((i) => hasAny(i.name, base.match)))
      .map((r) => ({ r, score: (hasAny(r.title, REUSE) ? 10 : 0) - r.ingredients.length / 10 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((x) => x.r);
    if (recipes.length) out.push({ base: key, recipes });
  }
  return out;
}
