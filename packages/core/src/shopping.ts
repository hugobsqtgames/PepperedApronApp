import type { Locale, ShoppingCategoryKey } from './enums';
import { SHOPPING_CATEGORIES } from './enums';
import { normalizeText, singularize, tokenize, ingredientKey } from './text';
import { getUnit, unitLabel } from './units';
import { formatAmount, normalizeAmount, scaleAmount, scaleFactor } from './quantity';

/** Multilingual keyword dictionary (normalized, singular). Longest match wins. */
const KEYWORDS: Record<Exclude<ShoppingCategoryKey, 'other'>, string[]> = {
  produce: [
    // fr
    'tomate',
    'salade',
    'laitue',
    'roquette',
    'mache',
    'epinard',
    'oignon',
    'echalote',
    'ail',
    'carotte',
    'courgette',
    'poivron',
    'piment',
    'aubergine',
    'pomme',
    'poire',
    'citron',
    'citron vert',
    'orange',
    'pamplemousse',
    'banane',
    'fraise',
    'framboise',
    'myrtille',
    'cerise',
    'abricot',
    'peche',
    'nectarine',
    'prune',
    'raisin',
    'kiwi',
    'mangue',
    'ananas',
    'avocat',
    'concombre',
    'champignon',
    'brocoli',
    'chou',
    'chou fleur',
    'poireau',
    'celeri',
    'fenouil',
    'radis',
    'navet',
    'betterave',
    'potiron',
    'citrouille',
    'butternut',
    'courge',
    'patate douce',
    'pomme de terre',
    'haricot vert',
    'petit pois',
    'mais',
    'artichaut',
    'asperge',
    'endive',
    'persil',
    'coriandre',
    'basilic',
    'menthe',
    'ciboulette',
    'thym frais',
    'aneth',
    'estragon',
    'gingembre',
    'citronnelle',
    'melon',
    'pasteque',
    'figue',
    'grenade',
    'rhubarbe',
    'cresson',
    'blette',
    'panais',
    'topinambour',
    'shiitake',
    'pleurote',
    'girolle',
    'cepe',
    // en
    'tomato',
    'lettuce',
    'arugula',
    'rocket',
    'spinach',
    'onion',
    'shallot',
    'garlic',
    'carrot',
    'zucchini',
    'courgette',
    'bell pepper',
    'chili',
    'eggplant',
    'apple',
    'pear',
    'lemon',
    'lime',
    'grapefruit',
    'banana',
    'strawberry',
    'raspberry',
    'blueberry',
    'cherry',
    'apricot',
    'peach',
    'plum',
    'grape',
    'mango',
    'pineapple',
    'avocado',
    'cucumber',
    'mushroom',
    'broccoli',
    'cabbage',
    'cauliflower',
    'leek',
    'celery',
    'fennel',
    'radish',
    'turnip',
    'beetroot',
    'beet',
    'pumpkin',
    'squash',
    'sweet potato',
    'potato',
    'green bean',
    'pea',
    'corn',
    'artichoke',
    'asparagus',
    'parsley',
    'cilantro',
    'coriander',
    'basil',
    'mint',
    'chive',
    'dill',
    'ginger',
    'watermelon',
    'fig',
    'kale',
    'scallion',
    'spring onion',
    // es
    'tomate',
    'lechuga',
    'espinaca',
    'cebolla',
    'ajo',
    'zanahoria',
    'calabacin',
    'pimiento',
    'berenjena',
    'manzana',
    'pera',
    'limon',
    'naranja',
    'platano',
    'fresa',
    'aguacate',
    'pepino',
    'champinon',
    'seta',
    'patata',
    'papa',
    'perejil',
    'cilantro',
    'albahaca',
    'jengibre',
    'puerro',
    'calabaza',
    // de
    'tomate',
    'salat',
    'spinat',
    'zwiebel',
    'knoblauch',
    'karotte',
    'mohre',
    'zucchini',
    'paprika',
    'aubergine',
    'apfel',
    'birne',
    'zitrone',
    'limette',
    'banane',
    'erdbeere',
    'gurke',
    'pilz',
    'champignon',
    'brokkoli',
    'kohl',
    'blumenkohl',
    'lauch',
    'kartoffel',
    'petersilie',
    'basilikum',
    'ingwer',
    'kurbis',
    'schnittlauch',
    // it
    'pomodoro',
    'lattuga',
    'rucola',
    'spinaci',
    'cipolla',
    'aglio',
    'carota',
    'zucchina',
    'peperone',
    'melanzana',
    'mela',
    'limone',
    'arancia',
    'fragola',
    'cetriolo',
    'fungo',
    'funghi',
    'patata',
    'prezzemolo',
    'basilico',
    'zenzero',
    'porro',
    'zucca',
  ],
  bakery: [
    'pain',
    'baguette',
    'pain de mie',
    'brioche',
    'croissant',
    'pain burger',
    'pita',
    'tortilla',
    'wrap',
    'bread',
    'bun',
    'loaf',
    'pan',
    'pan rallado',
    'brot',
    'brotchen',
    'pane',
    'focaccia',
    'pain pita',
    'chapelure',
  ],
  meat_fish: [
    'poulet',
    'blanc de poulet',
    'boeuf',
    'steak',
    'hache',
    'viande hachee',
    'porc',
    'agneau',
    'veau',
    'dinde',
    'canard',
    'jambon',
    'lardon',
    'bacon',
    'saucisse',
    'chorizo',
    'merguez',
    'viande',
    'filet mignon',
    'escalope',
    'cote',
    'gigot',
    'roti',
    'rosbif',
    'magret',
    'foie gras',
    'saumon',
    'thon',
    'cabillaud',
    'colin',
    'merlu',
    'lieu',
    'dorade',
    'bar de ligne',
    'truite',
    'sardine',
    'maquereau',
    'crevette',
    'gambas',
    'moule',
    'saint jacques',
    'poisson',
    'calamar',
    'seiche',
    'poulpe',
    'crabe',
    'homard',
    'surimi',
    'anchois',
    'chicken',
    'beef',
    'ground beef',
    'minced meat',
    'pork',
    'lamb',
    'veal',
    'turkey',
    'duck',
    'ham',
    'sausage',
    'meat',
    'salmon',
    'tuna',
    'cod',
    'shrimp',
    'prawn',
    'mussel',
    'scallop',
    'fish',
    'squid',
    'crab',
    'lobster',
    'anchovy',
    'pollo',
    'ternera',
    'carne',
    'cerdo',
    'cordero',
    'pavo',
    'jamon',
    'salchicha',
    'salmon',
    'atun',
    'bacalao',
    'gamba',
    'langostino',
    'mejillon',
    'pescado',
    'calamares',
    'hahnchen',
    'huhn',
    'rind',
    'rindfleisch',
    'hackfleisch',
    'schwein',
    'schweinefleisch',
    'lamm',
    'kalb',
    'pute',
    'ente',
    'schinken',
    'speck',
    'wurst',
    'fleisch',
    'lachs',
    'thunfisch',
    'kabeljau',
    'garnele',
    'fisch',
    'pollo',
    'manzo',
    'macinato',
    'maiale',
    'agnello',
    'vitello',
    'tacchino',
    'anatra',
    'prosciutto',
    'pancetta',
    'guanciale',
    'salsiccia',
    'salmone',
    'tonno',
    'merluzzo',
    'gambero',
    'cozza',
    'pesce',
  ],
  dairy_eggs: [
    'lait',
    'creme',
    'creme fraiche',
    'creme liquide',
    'beurre',
    'yaourt',
    'fromage',
    'fromage blanc',
    'oeuf',
    'mozzarella',
    'parmesan',
    'ricotta',
    'mascarpone',
    'feta',
    'comte',
    'emmental',
    'gruyere',
    'chevre',
    'reblochon',
    'camembert',
    'roquefort',
    'petit suisse',
    'skyr',
    'gorgonzola',
    'burrata',
    'cheddar',
    'milk',
    'cream',
    'heavy cream',
    'sour cream',
    'butter',
    'yogurt',
    'yoghurt',
    'cheese',
    'egg',
    'cream cheese',
    'leche',
    'nata',
    'mantequilla',
    'yogur',
    'queso',
    'huevo',
    'milch',
    'sahne',
    'butter',
    'joghurt',
    'kase',
    'ei',
    'eier',
    'quark',
    'schmand',
    'latte',
    'panna',
    'burro',
    'yogurt',
    'formaggio',
    'uovo',
    'uova',
    'pecorino',
  ],
  pantry: [
    'pate',
    'pates',
    'spaghetti',
    'tagliatelle',
    'penne',
    'fusilli',
    'lasagne',
    'riz',
    'semoule',
    'couscous',
    'quinoa',
    'boulgour',
    'lentille',
    'pois chiche',
    'haricot rouge',
    'haricot blanc',
    'farine',
    'maizena',
    'fecule',
    'levure',
    'bicarbonate',
    'flocon d avoine',
    'avoine',
    'huile',
    'huile d olive',
    'vinaigre',
    'bouillon',
    'cube',
    'concentre de tomate',
    'coulis',
    'tomate concassee',
    'pulpe de tomate',
    'lait de coco',
    'conserve',
    'noix',
    'amande',
    'noisette',
    'pignon',
    'cacahuete',
    'graine',
    'sesame',
    'raisin sec',
    'pruneau',
    'olive',
    'capre',
    'cornichon',
    'nouille',
    'vermicelle',
    'polenta',
    'gnocchi',
    'pain de mie',
    'pasta',
    'noodle',
    'rice',
    'flour',
    'cornstarch',
    'yeast',
    'baking powder',
    'baking soda',
    'oat',
    'oil',
    'olive oil',
    'vinegar',
    'stock',
    'broth',
    'tomato paste',
    'coconut milk',
    'nut',
    'almond',
    'hazelnut',
    'peanut',
    'chickpea',
    'lentil',
    'bean',
    'arroz',
    'harina',
    'aceite',
    'vinagre',
    'caldo',
    'garbanzo',
    'lenteja',
    'judia',
    'levadura',
    'nudel',
    'reis',
    'mehl',
    'hefe',
    'backpulver',
    'ol',
    'essig',
    'bruhe',
    'linse',
    'kichererbse',
    'bohne',
    'riso',
    'farina',
    'lievito',
    'olio',
    'aceto',
    'brodo',
    'ceci',
    'lenticchia',
    'fagiolo',
  ],
  condiments: [
    'sel',
    'poivre',
    'epice',
    'cumin',
    'curry',
    'paprika fume',
    'curcuma',
    'cannelle',
    'muscade',
    'herbes de provence',
    'thym',
    'laurier',
    'origan',
    'romarin',
    'moutarde',
    'ketchup',
    'mayonnaise',
    'sauce soja',
    'sauce',
    'pesto',
    'tabasco',
    'harissa',
    'piment d espelette',
    'vanille',
    'extrait de vanille',
    'fleur de sel',
    'salt',
    'pepper',
    'spice',
    'cinnamon',
    'nutmeg',
    'oregano',
    'rosemary',
    'bay leaf',
    'thyme',
    'mustard',
    'soy sauce',
    'vanilla',
    'sal',
    'pimienta',
    'comino',
    'canela',
    'salz',
    'pfeffer',
    'senf',
    'zimt',
    'sale',
    'pepe',
    'senape',
    'cannella',
    'origano',
    'rosmarino',
  ],
  sweets_breakfast: [
    'sucre',
    'sucre glace',
    'cassonade',
    'miel',
    'confiture',
    'chocolat',
    'chocolat noir',
    'cacao',
    'pepite de chocolat',
    'biscuit',
    'cereale',
    'nutella',
    'pate a tartiner',
    'sirop',
    'sirop d erable',
    'cafe',
    'the',
    'caramel',
    'speculoos',
    'sugar',
    'brown sugar',
    'honey',
    'jam',
    'chocolate',
    'cocoa',
    'cookie',
    'cereal',
    'syrup',
    'maple syrup',
    'coffee',
    'tea',
    'azucar',
    'miel',
    'mermelada',
    'chocolate',
    'zucker',
    'honig',
    'marmelade',
    'schokolade',
    'kakao',
    'kaffee',
    'tee',
    'zucchero',
    'miele',
    'marmellata',
    'cioccolato',
    'caffe',
    'savoiardi',
    'boudoir',
  ],
  frozen: [
    'surgele',
    'glace',
    'sorbet',
    'petits pois surgeles',
    'frozen',
    'ice cream',
    'congelado',
    'helado',
    'tiefkuhl',
    'eis',
    'surgelato',
    'gelato',
    'pate feuilletee surgelee',
  ],
  drinks: [
    'eau',
    'eau gazeuse',
    'jus',
    'jus d orange',
    'soda',
    'biere',
    'vin',
    'vin blanc',
    'vin rouge',
    'champagne',
    'cidre',
    'rhum',
    'whisky',
    'vodka',
    'gin',
    'limonade',
    'sirop de menthe',
    'water',
    'juice',
    'beer',
    'wine',
    'white wine',
    'red wine',
    'rum',
    'agua',
    'zumo',
    'cerveza',
    'vino',
    'wasser',
    'saft',
    'bier',
    'wein',
    'acqua',
    'succo',
    'birra',
    'prosecco',
    'aperol',
  ],
  household: [
    'papier toilette',
    'essuie tout',
    'sac poubelle',
    'liquide vaisselle',
    'lessive',
    'eponge',
    'papier cuisson',
    'papier aluminium',
    'film alimentaire',
    'toilet paper',
    'paper towel',
    'trash bag',
    'dish soap',
    'detergent',
    'sponge',
    'baking paper',
    'parchment paper',
    'aluminium foil',
    'foil',
    'plastic wrap',
  ],
};

// Some items belong to a more specific category than a word they contain.
const OVERRIDES: [string, ShoppingCategoryKey][] = [
  ['pate feuilletee', 'dairy_eggs'],
  ['pate brisee', 'dairy_eggs'],
  ['pate sablee', 'dairy_eggs'],
  ['pate a pizza', 'dairy_eggs'],
  ['beurre de cacahuete', 'pantry'],
  ['peanut butter', 'pantry'],
  ['lait de coco', 'pantry'],
  ['coconut milk', 'pantry'],
  ['creme de coco', 'pantry'],
  ['creme de marron', 'sweets_breakfast'],
  ['vinaigre balsamique', 'pantry'],
  ['poivre noir', 'condiments'],
  ['tomate sechee', 'pantry'],
  ['tomates concassees', 'pantry'],
  ['sauce tomate', 'pantry'],
  ['haricots verts surgeles', 'frozen'],
  ['epinards surgeles', 'frozen'],
];

type Entry = { tokens: string[]; category: ShoppingCategoryKey };
const DICT: Entry[] = [
  ...OVERRIDES.map(([k, c]) => ({ tokens: tokenize(k).map(singularize), category: c })),
  ...Object.entries(KEYWORDS).flatMap(([cat, words]) =>
    words.map((w) => ({
      tokens: tokenize(w).map(singularize),
      category: cat as ShoppingCategoryKey,
    })),
  ),
];

/** Index of the first occurrence of `needle` in `hay`, or -1. */
function findSeq(hay: string[], needle: string[]): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * Deterministic aisle classification. Longest keyword sequence wins; on a tie the earliest match
 * wins (head noun first in French/Spanish/Italian: "glace vanille" → frozen); overrides win ties.
 */
export function categorizeIngredient(name: string): ShoppingCategoryKey {
  const toks = tokenize(name).map(singularize);
  if (!toks.length) return 'other';
  let best: { e: Entry; at: number } | null = null;
  for (const e of DICT) {
    if (!e.tokens.length) continue;
    const at = findSeq(toks, e.tokens);
    if (at < 0) continue;
    if (
      !best ||
      e.tokens.length > best.e.tokens.length ||
      (e.tokens.length === best.e.tokens.length && at < best.at)
    ) {
      best = { e, at };
    }
  }
  return best?.e.category ?? 'other';
}

export function sortCategories(order: string[] | null | undefined): string[] {
  const base = order?.length ? order : [...SHOPPING_CATEGORIES];
  const rest = SHOPPING_CATEGORIES.filter((c) => !base.includes(c));
  return [...base, ...rest];
}

export interface ShoppingLine {
  name: string;
  quantity: number | null;
  unit: string | null;
  recipeIds: string[];
}

export interface MergeableItem extends ShoppingLine {
  categoryKey: string;
  checked: boolean;
}

/** Key for merging: same ingredient + same dimension (g and kg merge; g and pieces don't). */
export function mergeKey(name: string, unit: string | null): string {
  const u = getUnit(unit);
  const dim = u
    ? u.dimension === 'count'
      ? `count:${u.key}`
      : u.dimension
    : unit
      ? `raw:${normalizeText(unit)}`
      : 'none';
  return `${ingredientKey(name)}|${dim}`;
}

function addInto(
  target: { quantity: number | null; unit: string | null },
  q: number | null,
  unit: string | null,
) {
  if (q === null) return;
  if (target.quantity === null) {
    target.quantity = q;
    target.unit = unit;
    return;
  }
  const a = getUnit(target.unit);
  const b = getUnit(unit);
  if (a && b && a.dimension === b.dimension && a.dimension !== 'count') {
    // Convert to the target's unit.
    target.quantity = target.quantity + (q * b.toBase) / a.toBase;
  } else {
    target.quantity += q;
  }
}

/** Merge lines with the same ingredient/dimension, normalising units (600 g + 0.5 kg → 1.1 kg). */
export function mergeShoppingLines(lines: ShoppingLine[]): ShoppingLine[] {
  const map = new Map<string, ShoppingLine>();
  for (const l of lines) {
    const k = mergeKey(l.name, l.unit);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { ...l, recipeIds: [...new Set(l.recipeIds)] });
      continue;
    }
    addInto(cur, l.quantity, l.unit);
    cur.recipeIds = [...new Set([...cur.recipeIds, ...l.recipeIds])];
  }
  return [...map.values()].map((l) => {
    const n = normalizeAmount({ quantity: l.quantity, quantityMax: null, unit: l.unit });
    return { ...l, quantity: n.quantity, unit: n.unit };
  });
}

export interface PlannedRecipe {
  recipeId: string;
  recipeServings: number | null;
  plannedServings: number | null;
  ingredients: {
    name: string;
    quantity: number | null;
    quantityMax: number | null;
    unit: string | null;
  }[];
}

/** Ingredients for a set of planned meals, scaled to planned servings and merged. */
export function shoppingLinesFromPlan(
  planned: PlannedRecipe[],
  defaultServings: number,
): ShoppingLine[] {
  const lines: ShoppingLine[] = [];
  for (const p of planned) {
    const factor = scaleFactor(
      p.recipeServings,
      p.plannedServings ?? p.recipeServings ?? defaultServings,
    );
    for (const ing of p.ingredients) {
      const s = scaleAmount(ing, factor);
      // Ranges are shopped at the upper bound.
      lines.push({
        name: ing.name,
        quantity: s.quantityMax ?? s.quantity,
        unit: s.unit,
        recipeIds: [p.recipeId],
      });
    }
  }
  return mergeShoppingLines(lines);
}

export interface ExistingItem extends MergeableItem {
  id: string;
}

export type ShoppingMergePlan =
  | {
      kind: 'update';
      id: string;
      quantity: number | null;
      unit: string | null;
      recipeIds: string[];
    }
  | { kind: 'insert'; line: ShoppingLine; categoryKey: ShoppingCategoryKey };

/**
 * Add generated lines into an existing list: unchecked items with the same key are increased,
 * otherwise new items are inserted. Checked items are never modified (already bought).
 */
export function planMergeIntoList(
  existing: ExistingItem[],
  lines: ShoppingLine[],
): ShoppingMergePlan[] {
  const open = new Map<string, ExistingItem>();
  for (const e of existing) if (!e.checked) open.set(mergeKey(e.name, e.unit), e);
  const out: ShoppingMergePlan[] = [];
  for (const l of lines) {
    const e = open.get(mergeKey(l.name, l.unit));
    if (e) {
      const t = { quantity: e.quantity, unit: e.unit };
      addInto(t, l.quantity, l.unit);
      const n = normalizeAmount({ quantity: t.quantity, quantityMax: null, unit: t.unit });
      out.push({
        kind: 'update',
        id: e.id,
        quantity: n.quantity,
        unit: n.unit,
        recipeIds: [...new Set([...e.recipeIds, ...l.recipeIds])],
      });
    } else {
      out.push({ kind: 'insert', line: l, categoryKey: categorizeIngredient(l.name) });
    }
  }
  return out;
}

export function formatShoppingQuantity(
  item: { quantity: number | null; unit: string | null },
  locale: Locale,
): string {
  if (item.quantity === null) return '';
  const amount = formatAmount(
    { quantity: item.quantity, quantityMax: null, unit: item.unit },
    locale,
  );
  const label = getUnit(item.unit)
    ? unitLabel(item.unit, item.quantity, locale)
    : (item.unit ?? '');
  return label ? `${amount} ${label}` : amount;
}

/** Group items by category in store order; unknown/custom keys keep their own group. */
export function groupByCategory<
  T extends { categoryKey: string; checked: boolean; position: number },
>(items: T[], order: string[]): { key: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = it.categoryKey || 'other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return keys.map((key) => ({
    key,
    items: groups
      .get(key)!
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.position - b.position),
  }));
}
