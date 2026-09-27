import type { Difficulty, RecipeCategory, Season } from './enums';
import { normalizeText, singularize, tokenize } from './text';

export interface SearchableRecipe {
  id: string;
  title: string;
  description: string | null;
  category: RecipeCategory | null;
  tags: string[];
  difficulty: Difficulty | null;
  seasons: Season[];
  totalMinutes: number | null;
  ingredientNames: string[];
  updatedAt: string;
}

export interface SearchFilters {
  categories: RecipeCategory[];
  difficulty: Difficulty | null;
  maxMinutes: number | null;
  seasons: Season[];
  tags: string[];
  /** "What's in my fridge": ranks by coverage instead of filtering. */
  fridge: string[];
}

export const EMPTY_FILTERS: SearchFilters = {
  categories: [],
  difficulty: null,
  maxMinutes: null,
  seasons: [],
  tags: [],
  fridge: [],
};

export interface ParsedQuery {
  terms: string[];
  excluded: string[];
  maxMinutes: number | null;
  difficulty: Difficulty | null;
  seasons: Season[];
  categories: RecipeCategory[];
  cuisines: string[];
}

const STOP = new Set(
  'de du des la le les l d un une et ou a au aux avec pour en sur recette recettes plat plats idee idees faire comment the a an and or with for of recipe recipes dish to how make el la los las y o con para receta recetas un una der die das und mit fur ein eine rezept rezepte il lo gli e con per ricetta ricette di da minutes minute min moins less than under menos weniger meno'.split(
    ' ',
  ),
);

const QUICK = [
  'rapide',
  'rapides',
  'vite',
  'express',
  'quick',
  'fast',
  'easy weeknight',
  'rapido',
  'rapida',
  'schnell',
  'schnelle',
  'veloce',
  'veloci',
];
const DIFFICULTY_WORDS: Record<string, Difficulty> = {
  facile: 'easy',
  faciles: 'easy',
  simple: 'easy',
  simples: 'easy',
  easy: 'easy',
  facil: 'easy',
  einfach: 'easy',
  einfache: 'easy',
  semplice: 'easy',
  semplici: 'easy',
  intermediaire: 'medium',
  moyen: 'medium',
  medium: 'medium',
  intermedio: 'medium',
  mittel: 'medium',
  media: 'medium',
  difficile: 'hard',
  difficiles: 'hard',
  hard: 'hard',
  dificil: 'hard',
  schwer: 'hard',
  schwierig: 'hard',
  difficili: 'hard',
  elabore: 'hard',
};
const SEASON_WORDS: Record<string, Season> = {
  printemps: 'spring',
  spring: 'spring',
  primavera: 'spring',
  fruhling: 'spring',
  fruhlings: 'spring',
  ete: 'summer',
  estival: 'summer',
  estivale: 'summer',
  summer: 'summer',
  verano: 'summer',
  sommer: 'summer',
  estate: 'summer',
  estivo: 'summer',
  automne: 'autumn',
  automnal: 'autumn',
  automnale: 'autumn',
  autumn: 'autumn',
  fall: 'autumn',
  otono: 'autumn',
  herbst: 'autumn',
  autunno: 'autumn',
  hiver: 'winter',
  hivernal: 'winter',
  winter: 'winter',
  invierno: 'winter',
  inverno: 'winter',
};
const CATEGORY_WORDS: Record<string, RecipeCategory> = {
  'petit dejeuner': 'breakfast',
  'petit dej': 'breakfast',
  brunch: 'breakfast',
  breakfast: 'breakfast',
  desayuno: 'breakfast',
  fruhstuck: 'breakfast',
  colazione: 'breakfast',
  apero: 'appetizer',
  aperitif: 'appetizer',
  aperitivo: 'appetizer',
  appetizer: 'appetizer',
  tapas: 'appetizer',
  antipasto: 'appetizer',
  antipasti: 'appetizer',
  vorspeise: 'starter',
  entree: 'starter',
  entrees: 'starter',
  starter: 'starter',
  starters: 'starter',
  entrante: 'starter',
  primo: 'starter',
  soupe: 'soup',
  soupes: 'soup',
  veloute: 'soup',
  potage: 'soup',
  soup: 'soup',
  sopa: 'soup',
  suppe: 'soup',
  zuppa: 'soup',
  minestra: 'soup',
  salade: 'salad',
  salades: 'salad',
  salad: 'salad',
  ensalada: 'salad',
  salat: 'salad',
  insalata: 'salad',
  pates: 'pasta',
  pasta: 'pasta',
  nudeln: 'pasta',
  spaghetti: 'pasta',
  lasagne: 'pasta',
  lasagnes: 'pasta',
  viande: 'meat',
  viandes: 'meat',
  meat: 'meat',
  carne: 'meat',
  fleisch: 'meat',
  poisson: 'fish',
  poissons: 'fish',
  fish: 'fish',
  seafood: 'fish',
  pescado: 'fish',
  fisch: 'fish',
  pesce: 'fish',
  'fruits de mer': 'fish',
  mariscos: 'fish',
  vegetarien: 'vegetarian',
  vegetarienne: 'vegetarian',
  veggie: 'vegetarian',
  vegetarian: 'vegetarian',
  vegetariano: 'vegetarian',
  vegetarisch: 'vegetarian',
  vegan: 'vegetarian',
  vegane: 'vegetarian',
  accompagnement: 'side',
  accompagnements: 'side',
  side: 'side',
  sides: 'side',
  guarnicion: 'side',
  beilage: 'side',
  contorno: 'side',
  sauce: 'sauce',
  sauces: 'sauce',
  salsa: 'sauce',
  sosse: 'sauce',
  sugo: 'sauce',
  gateau: 'baking',
  gateaux: 'baking',
  patisserie: 'baking',
  cake: 'baking',
  baking: 'baking',
  pain: 'baking',
  bread: 'baking',
  reposteria: 'baking',
  kuchen: 'baking',
  backen: 'baking',
  torta: 'baking',
  dolci: 'dessert',
  dessert: 'dessert',
  desserts: 'dessert',
  postre: 'dessert',
  postres: 'dessert',
  nachtisch: 'dessert',
  nachspeise: 'dessert',
  dolce: 'dessert',
  gouter: 'snack',
  snack: 'snack',
  snacks: 'snack',
  merienda: 'snack',
  merenda: 'snack',
  boisson: 'drinks',
  boissons: 'drinks',
  cocktail: 'drinks',
  cocktails: 'drinks',
  drink: 'drinks',
  drinks: 'drinks',
  bebida: 'drinks',
  getranke: 'drinks',
  bevanda: 'drinks',
  smoothie: 'drinks',
  plat: 'main',
  'plat principal': 'main',
  main: 'main',
  'main course': 'main',
  principal: 'main',
  hauptgericht: 'main',
  secondo: 'main',
};
/** Cuisine keywords expand to terms that commonly appear in such recipes. */
const CUISINES: Record<string, string[]> = {
  italian: [
    'italie',
    'italien',
    'italienne',
    'italian',
    'italiano',
    'italiana',
    'italienisch',
    'pizza',
    'pasta',
    'pates',
    'risotto',
    'lasagne',
    'tiramisu',
    'pesto',
    'carbonara',
    'bolognaise',
    'gnocchi',
    'parmesan',
    'mozzarella',
    'bruschetta',
    'panna cotta',
  ],
  asian: [
    'asie',
    'asiatique',
    'asian',
    'asiatico',
    'asiatisch',
    'wok',
    'soja',
    'curry',
    'ramen',
    'pad thai',
    'nems',
    'sushi',
    'riz cantonais',
    'teriyaki',
    'coco',
    'gingembre',
  ],
  japanese: [
    'japon',
    'japonais',
    'japonaise',
    'japanese',
    'japones',
    'japanisch',
    'giapponese',
    'sushi',
    'ramen',
    'teriyaki',
    'miso',
    'tempura',
    'matcha',
    'onigiri',
  ],
  indian: [
    'inde',
    'indien',
    'indienne',
    'indian',
    'indio',
    'indisch',
    'indiano',
    'curry',
    'tandoori',
    'dal',
    'naan',
    'tikka',
    'masala',
    'biryani',
  ],
  mexican: [
    'mexique',
    'mexicain',
    'mexicaine',
    'mexican',
    'mexicano',
    'mexikanisch',
    'messicano',
    'tacos',
    'burrito',
    'guacamole',
    'fajitas',
    'quesadilla',
    'chili con carne',
    'nachos',
    'enchiladas',
  ],
  french: [
    'france',
    'francais',
    'francaise',
    'french',
    'frances',
    'franzosisch',
    'francese',
    'bourguignon',
    'quiche',
    'gratin',
    'blanquette',
    'ratatouille',
    'crepe',
    'tartiflette',
    'pot au feu',
    'croque',
  ],
  spanish: [
    'espagne',
    'espagnol',
    'espagnole',
    'spanish',
    'espanol',
    'spanisch',
    'spagnolo',
    'paella',
    'tortilla',
    'gazpacho',
    'tapas',
    'chorizo',
    'churros',
  ],
  greek: [
    'grece',
    'grec',
    'grecque',
    'greek',
    'griego',
    'griechisch',
    'greco',
    'tzatziki',
    'moussaka',
    'feta',
    'souvlaki',
    'gyros',
  ],
  oriental: [
    'oriental',
    'orientale',
    'libanais',
    'libanaise',
    'marocain',
    'marocaine',
    'lebanese',
    'moroccan',
    'houmous',
    'hummus',
    'taboule',
    'tajine',
    'couscous',
    'falafel',
    'shakshuka',
  ],
};
const CUISINE_TRIGGERS = new Map<string, string>();
for (const [k, words] of Object.entries(CUISINES))
  for (const w of words.slice(0, 7)) CUISINE_TRIGGERS.set(w, k);

const EXCLUDE_WORDS = new Set(['sans', 'without', 'sin', 'ohne', 'senza', 'no']);

export function currentSeason(date: Date = new Date()): Season {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/** Parse a simple natural-language query ("poulet rapide", "italien moins de 30 minutes"). No AI. */
export function parseSearchQuery(q: string, now: Date = new Date()): ParsedQuery {
  const res: ParsedQuery = {
    terms: [],
    excluded: [],
    maxMinutes: null,
    difficulty: null,
    seasons: [],
    categories: [],
    cuisines: [],
  };
  let n = normalizeText(q);

  // Durations: "moins de 30 min", "< 45 minutes", "en 20 min", "under 1 hour", "30 min"
  const dm = n.match(
    /(?:<|<=|\bmoins d[e']|\ben moins d[e']|\bmax(?:imum)?|\bunder|\bless than|\bin|\ben|\bmenos de|\ben menos de|\bunter|\bweniger als|\bin meno di|\bmeno di|\bentro)?\s*(\d{1,3})\s*(min|minutes?|mn|h|heures?|hours?|horas?|stunden?|std|ore|ora|minutos?|minuten|minuti)\b/,
  );
  if (dm) {
    const v = Number(dm[1]);
    res.maxMinutes = /^(h|heure|hour|hora|stunde|std|ore|ora)/.test(dm[2]!) ? v * 60 : v;
    n = n.replace(dm[0], ' ');
  }
  // Multi-word category phrases first.
  for (const phrase of Object.keys(CATEGORY_WORDS).filter((k) => k.includes(' '))) {
    if (n.includes(phrase)) {
      res.categories.push(CATEGORY_WORDS[phrase]!);
      n = n.replace(phrase, ' ');
    }
  }
  if (/\bde saison\b|\bseasonal\b|\bde temporada\b|\bsaisonal\b|\bdi stagione\b/.test(n)) {
    res.seasons.push(currentSeason(now));
    n = n.replace(/\bde saison\b|\bseasonal\b|\bde temporada\b|\bsaisonal\b|\bdi stagione\b/, ' ');
  }

  const tokens = tokenize(n);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (EXCLUDE_WORDS.has(t) && tokens[i + 1]) {
      res.excluded.push(singularize(tokens[i + 1]!));
      i++;
      continue;
    }
    if (QUICK.includes(t)) {
      res.maxMinutes = Math.min(res.maxMinutes ?? 30, 30);
      continue;
    }
    if (DIFFICULTY_WORDS[t]) {
      res.difficulty = DIFFICULTY_WORDS[t]!;
      continue;
    }
    if (SEASON_WORDS[t]) {
      res.seasons.push(SEASON_WORDS[t]!);
      continue;
    }
    if (CUISINE_TRIGGERS.has(t)) {
      res.cuisines.push(CUISINE_TRIGGERS.get(t)!);
      continue;
    }
    if (CATEGORY_WORDS[t]) {
      res.categories.push(CATEGORY_WORDS[t]!);
      // Category words are also kept as soft terms (a "salade" tag should still match).
      continue;
    }
    if (STOP.has(t) || /^\d+$/.test(t)) continue;
    res.terms.push(singularize(t));
  }
  res.seasons = [...new Set(res.seasons)];
  res.categories = [...new Set(res.categories)];
  res.cuisines = [...new Set(res.cuisines)];
  return res;
}

interface Indexed {
  title: string[];
  ingredients: string[];
  tags: string[];
  body: string[];
  all: string;
}

function index(r: SearchableRecipe): Indexed {
  const title = tokenize(r.title).map(singularize);
  const ingredients = r.ingredientNames.flatMap((n) => tokenize(n).map(singularize));
  const tags = r.tags.flatMap((t) => tokenize(t).map(singularize));
  const body = tokenize(r.description ?? '').map(singularize);
  return {
    title,
    ingredients,
    tags,
    body,
    all: normalizeText([r.title, r.description ?? '', ...r.tags, ...r.ingredientNames].join(' ')),
  };
}

function tokenMatch(tokens: string[], term: string): number {
  let best = 0;
  for (const tok of tokens) {
    if (tok === term) return 1;
    if (term.length >= 3 && tok.startsWith(term)) best = Math.max(best, 0.8);
    else if (tok.length >= 4 && term.startsWith(tok)) best = Math.max(best, 0.6);
  }
  return best;
}

export interface SearchResult<T> {
  recipe: T;
  score: number;
  /** For fridge search: ingredients of the recipe the user does not have. */
  missing: string[];
  matchedFridge: number;
}

/** Pantry staples ignored when computing "what can I cook with my fridge". */
const STAPLES = new Set([
  'sel',
  'poivre',
  'eau',
  'huile',
  'sucre',
  'salt',
  'pepper',
  'water',
  'oil',
  'sugar',
  'sal',
  'pimienta',
  'agua',
  'aceite',
  'azucar',
  'salz',
  'pfeffer',
  'wasser',
  'ol',
  'zucker',
  'pepe',
  'acqua',
  'olio',
  'zucchero',
  'beurre',
  'butter',
]);

function isStaple(name: string): boolean {
  const toks = tokenize(name).map(singularize);
  return toks.length > 0 && toks.length <= 2 && toks.some((t) => STAPLES.has(t));
}

export function searchRecipes<T extends SearchableRecipe>(
  recipes: T[],
  query: string,
  filters: SearchFilters = EMPTY_FILTERS,
  now: Date = new Date(),
): SearchResult<T>[] {
  const pq = parseSearchQuery(query, now);
  const maxMinutes = [pq.maxMinutes, filters.maxMinutes].filter((x): x is number => x !== null);
  const maxM = maxMinutes.length ? Math.min(...maxMinutes) : null;
  const difficulty = filters.difficulty ?? pq.difficulty;
  const seasons = [...new Set([...filters.seasons, ...pq.seasons])];
  const fridge = filters.fridge.map((f) => tokenize(f).map(singularize)).filter((t) => t.length);
  const out: SearchResult<T>[] = [];

  for (const r of recipes) {
    if (maxM !== null && (r.totalMinutes === null || r.totalMinutes > maxM)) continue;
    if (difficulty && r.difficulty !== difficulty) continue;
    if (seasons.length && r.seasons.length && !r.seasons.some((s) => seasons.includes(s))) continue;
    if (filters.categories.length && (!r.category || !filters.categories.includes(r.category)))
      continue;
    if (
      filters.tags.length &&
      !filters.tags.every((t) => r.tags.map(normalizeText).includes(normalizeText(t)))
    )
      continue;

    const ix = index(r);
    let score = 0;
    let ok = true;
    for (const term of pq.terms) {
      const s =
        tokenMatch(ix.title, term) * 5 +
        tokenMatch(ix.ingredients, term) * 3 +
        tokenMatch(ix.tags, term) * 3 +
        tokenMatch(ix.body, term) * 1;
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;
    if (pq.excluded.some((x) => tokenMatch([...ix.title, ...ix.ingredients], x) >= 0.8)) continue;

    if (pq.categories.length) {
      const catHit = r.category !== null && pq.categories.includes(r.category);
      const softHit = pq.categories.some((c) => ix.tags.includes(c));
      if (!catHit && !softHit) continue;
      score += 2;
    }
    if (pq.cuisines.length) {
      const words = pq.cuisines.flatMap((c) => CUISINES[c] ?? []);
      const hit = words.some((w) => new RegExp(`\\b${w}`).test(ix.all));
      if (!hit) continue;
      score += 2;
    }

    let missing: string[] = [];
    let matched = 0;
    if (fridge.length) {
      const needed = r.ingredientNames.filter((n) => !isStaple(n));
      for (const name of needed) {
        const toks = tokenize(name).map(singularize);
        const have = fridge.some((f) =>
          f.every((ft) => toks.some((t) => t === ft || (ft.length >= 4 && t.startsWith(ft)))),
        );
        if (have) matched++;
        else missing.push(name);
      }
      if (matched === 0) continue;
      score += (matched / Math.max(needed.length, 1)) * 10 + matched;
    } else {
      missing = [];
    }
    if (!pq.terms.length && !fridge.length) score += 1;
    out.push({ recipe: r, score, missing, matchedFridge: matched });
  }

  return out.sort(
    (a, b) => b.score - a.score || b.recipe.updatedAt.localeCompare(a.recipe.updatedAt),
  );
}

/** True if the query or filters narrow anything down (used to switch the search screen to results). */
export function isActiveSearch(query: string, filters: SearchFilters): boolean {
  return (
    query.trim().length > 0 ||
    filters.categories.length > 0 ||
    filters.difficulty !== null ||
    filters.maxMinutes !== null ||
    filters.seasons.length > 0 ||
    filters.tags.length > 0 ||
    filters.fridge.length > 0
  );
}
