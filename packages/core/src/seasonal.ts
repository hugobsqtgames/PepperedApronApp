import type { Season } from './enums';
import { singularize, tokenize } from './text';

/**
 * Seasonal produce (France / Western Europe calendar). Entries without seasons are produce sold
 * all year: listed so that "pomme de terre" is not read as "pomme" (longest match wins).
 */
const CALENDAR: [string, Season[] | null][] = [
  // all year (blockers)
  ['pomme de terre', null],
  ['champignon de paris', null],
  ['tomate cerise', ['summer']],
  ['sauce tomate', null],
  ['concentre de tomate', null],
  ['coulis de tomate', null],
  ['tomate pelee', null],
  ['tomate concassee', null],
  ['tomate sechee', null],
  ['pulpe de tomate', null],
  ['jus de citron', null],
  ['potato', null],
  ['tomato paste', null],
  ['tomato sauce', null],
  ['canned tomato', null],
  ['sun dried tomato', null],
  // spring
  ['asperge', ['spring']],
  ['petit pois', ['spring', 'summer']],
  ['radis', ['spring']],
  ['rhubarbe', ['spring']],
  ['feve', ['spring']],
  ['artichaut', ['spring', 'summer']],
  ['morille', ['spring']],
  ['fraise', ['spring', 'summer']],
  ['epinard', ['spring', 'autumn']],
  ['asparagus', ['spring']],
  ['pea', ['spring', 'summer']],
  ['radish', ['spring']],
  ['rhubarb', ['spring']],
  ['broad bean', ['spring']],
  ['artichoke', ['spring', 'summer']],
  ['strawberry', ['spring', 'summer']],
  ['spinach', ['spring', 'autumn']],
  // summer
  ['tomate', ['summer']],
  ['courgette', ['summer']],
  ['aubergine', ['summer']],
  ['poivron', ['summer']],
  ['concombre', ['summer']],
  ['haricot vert', ['summer']],
  ['melon', ['summer']],
  ['pasteque', ['summer']],
  ['peche', ['summer']],
  ['nectarine', ['summer']],
  ['abricot', ['summer']],
  ['cerise', ['summer']],
  ['framboise', ['summer']],
  ['myrtille', ['summer']],
  ['mure', ['summer']],
  ['prune', ['summer']],
  ['mirabelle', ['summer']],
  ['figue', ['summer', 'autumn']],
  ['mais', ['summer']],
  ['tomato', ['summer']],
  ['zucchini', ['summer']],
  ['eggplant', ['summer']],
  ['bell pepper', ['summer']],
  ['cucumber', ['summer']],
  ['green bean', ['summer']],
  ['watermelon', ['summer']],
  ['peach', ['summer']],
  ['apricot', ['summer']],
  ['cherry', ['summer']],
  ['raspberry', ['summer']],
  ['blueberry', ['summer']],
  ['blackberry', ['summer']],
  ['plum', ['summer']],
  ['fig', ['summer', 'autumn']],
  ['corn', ['summer']],
  // autumn
  ['potiron', ['autumn', 'winter']],
  ['potimarron', ['autumn', 'winter']],
  ['citrouille', ['autumn']],
  ['butternut', ['autumn', 'winter']],
  ['courge', ['autumn', 'winter']],
  ['cepe', ['autumn']],
  ['girolle', ['autumn']],
  ['coing', ['autumn']],
  ['chataigne', ['autumn', 'winter']],
  ['marron', ['autumn', 'winter']],
  ['raisin', ['autumn']],
  ['poire', ['autumn', 'winter']],
  ['pomme', ['autumn', 'winter']],
  ['noix', ['autumn']],
  ['betterave', ['autumn', 'winter']],
  ['chou', ['autumn', 'winter']],
  ['panais', ['autumn', 'winter']],
  ['patate douce', ['autumn', 'winter']],
  ['pumpkin', ['autumn', 'winter']],
  ['squash', ['autumn', 'winter']],
  ['quince', ['autumn']],
  ['chestnut', ['autumn', 'winter']],
  ['grape', ['autumn']],
  ['pear', ['autumn', 'winter']],
  ['apple', ['autumn', 'winter']],
  ['beetroot', ['autumn', 'winter']],
  ['cabbage', ['autumn', 'winter']],
  ['parsnip', ['autumn', 'winter']],
  ['sweet potato', ['autumn', 'winter']],
  // winter
  ['poireau', ['autumn', 'winter']],
  ['endive', ['winter']],
  ['chou de bruxelle', ['winter']],
  ['chou fleur', ['autumn', 'winter']],
  ['navet', ['winter']],
  ['celeri rave', ['winter']],
  ['topinambour', ['winter']],
  ['salsifi', ['winter']],
  ['mache', ['winter']],
  ['orange', ['winter']],
  ['clementine', ['winter']],
  ['mandarine', ['winter']],
  ['pamplemousse', ['winter']],
  ['kiwi', ['winter']],
  ['kaki', ['winter']],
  ['leek', ['autumn', 'winter']],
  ['brussels sprout', ['winter']],
  ['cauliflower', ['autumn', 'winter']],
  ['turnip', ['winter']],
  ['celeriac', ['winter']],
  ['mandarin', ['winter']],
  ['grapefruit', ['winter']],
];

const ENTRIES = CALENDAR.map(([w, seasons]) => ({
  tokens: tokenize(w).map(singularize),
  seasons,
})).sort((a, b) => b.tokens.length - a.tokens.length);

/** Seasons of one ingredient name: null when it is not seasonal produce. */
export function ingredientSeasons(name: string): Season[] | null {
  const toks = tokenize(name).map(singularize);
  for (const e of ENTRIES) {
    for (let i = 0; i + e.tokens.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < e.tokens.length && ok; j++) ok = toks[i + j] === e.tokens[j];
      if (ok) return e.seasons;
    }
  }
  return null;
}

/**
 * Seasons a recipe is best in, from its seasonal produce: the seasons shared by all of them.
 * [] when it has none, or when they never are in season together (tomato + pumpkin).
 */
export function detectSeasons(ingredientNames: string[]): Season[] {
  let common: Season[] | null = null;
  for (const n of ingredientNames) {
    const s = ingredientSeasons(n);
    if (!s) continue;
    common = common === null ? [...s] : common.filter((x) => s.includes(x));
  }
  return common ?? [];
}

/** The seasons chosen by the user, or else the ones deduced from the ingredients. */
export function recipeSeasons(r: { seasons: Season[]; ingredients: { name: string }[] }): Season[] {
  return r.seasons.length ? r.seasons : detectSeasons(r.ingredients.map((i) => i.name));
}
