import type { Locale } from './enums';
import { normalizeText } from './text';

export type Dimension = 'mass' | 'volume' | 'count';

export interface UnitDef {
  key: string;
  dimension: Dimension;
  /** Factor to the dimension base unit (g for mass, ml for volume, 1 for count). */
  toBase: number;
  system: 'metric' | 'imperial' | 'any';
  /** Display quantities as fractions (½, ¼) rather than decimals. */
  fractions: boolean;
  aliases: string[];
  /** Display labels: [singular, plural] per locale. */
  labels: Record<Locale, [string, string]>;
}

const same = (s: string, p = s): Record<Locale, [string, string]> => ({
  fr: [s, p],
  en: [s, p],
  es: [s, p],
  de: [s, p],
  it: [s, p],
});

export const UNITS: UnitDef[] = [
  { key: 'mg', dimension: 'mass', toBase: 0.001, system: 'metric', fractions: false, aliases: ['mg', 'milligramme', 'milligrammes', 'milligram', 'milligrams', 'miligramo', 'miligramos', 'milligrammo', 'milligrammi'], labels: same('mg') },
  { key: 'g', dimension: 'mass', toBase: 1, system: 'metric', fractions: false, aliases: ['g', 'gr', 'grs', 'gramme', 'grammes', 'gram', 'grams', 'gramm', 'gramo', 'gramos', 'grammo', 'grammi'], labels: same('g') },
  { key: 'kg', dimension: 'mass', toBase: 1000, system: 'metric', fractions: false, aliases: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramme', 'kilogrammes', 'kilogram', 'kilograms', 'kilogramm', 'kilogramo', 'kilogramos', 'chilo', 'chili', 'chilogrammo', 'chilogrammi'], labels: same('kg') },
  { key: 'ml', dimension: 'volume', toBase: 1, system: 'metric', fractions: false, aliases: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'mililitro', 'mililitros', 'millilitro', 'millilitri'], labels: same('ml') },
  { key: 'cl', dimension: 'volume', toBase: 10, system: 'metric', fractions: false, aliases: ['cl', 'centilitre', 'centilitres', 'centiliter', 'centiliters', 'centilitro', 'centilitros', 'centilitri'], labels: same('cl') },
  { key: 'dl', dimension: 'volume', toBase: 100, system: 'metric', fractions: false, aliases: ['dl', 'decilitre', 'decilitres', 'deciliter', 'deciliters', 'decilitro', 'decilitros', 'decilitri'], labels: same('dl') },
  { key: 'l', dimension: 'volume', toBase: 1000, system: 'metric', fractions: false, aliases: ['l', 'lt', 'litre', 'litres', 'liter', 'liters', 'litro', 'litros', 'litri'], labels: same('l') },
  {
    key: 'tsp', dimension: 'volume', toBase: 5, system: 'any', fractions: true,
    aliases: ['c. a c.', 'c.a.c.', 'c.a.c', 'c. a c', 'cac', 'c a c', 'cc', 'c. a cafe', 'cuillere a cafe', 'cuilleres a cafe', 'cuil. a cafe', 'cuill. a cafe', 'cuillere a the', 'cuilleres a the', 'tsp', 'tsps', 'teaspoon', 'teaspoons', 'tsp.', 'cucharadita', 'cucharaditas', 'cdta', 'cdtas', 'cdta.', 'tl', 'teeloffel', 'cucchiaino', 'cucchiaini', 'cc.'],
    labels: { fr: ['c. à café', 'c. à café'], en: ['tsp', 'tsp'], es: ['cdta', 'cdtas'], de: ['TL', 'TL'], it: ['cucchiaino', 'cucchiaini'] },
  },
  {
    key: 'tbsp', dimension: 'volume', toBase: 15, system: 'any', fractions: true,
    aliases: ['c. a s.', 'c.a.s.', 'c.a.s', 'c. a s', 'cas', 'c a s', 'cs', 'c. a soupe', 'cuillere a soupe', 'cuilleres a soupe', 'cuil. a soupe', 'cuill. a soupe', 'tbsp', 'tbsps', 'tbs', 'tbsp.', 'tablespoon', 'tablespoons', 'cucharada', 'cucharadas', 'cda', 'cdas', 'cda.', 'el', 'essloffel', 'cucchiaio', 'cucchiai'],
    labels: { fr: ['c. à soupe', 'c. à soupe'], en: ['tbsp', 'tbsp'], es: ['cda', 'cdas'], de: ['EL', 'EL'], it: ['cucchiaio', 'cucchiai'] },
  },
  {
    key: 'cup', dimension: 'volume', toBase: 240, system: 'imperial', fractions: true,
    aliases: ['cup', 'cups', 'tasse', 'tasses', 'taza', 'tazas', 'tassen', 'tazza', 'tazze'],
    labels: { fr: ['tasse', 'tasses'], en: ['cup', 'cups'], es: ['taza', 'tazas'], de: ['Tasse', 'Tassen'], it: ['tazza', 'tazze'] },
  },
  { key: 'floz', dimension: 'volume', toBase: 29.5735, system: 'imperial', fractions: true, aliases: ['fl oz', 'fl. oz.', 'fl.oz', 'floz', 'fluid ounce', 'fluid ounces'], labels: same('fl oz') },
  { key: 'oz', dimension: 'mass', toBase: 28.3495, system: 'imperial', fractions: true, aliases: ['oz', 'oz.', 'ounce', 'ounces', 'once', 'onces', 'onza', 'onzas', 'unze', 'unzen', 'oncia'], labels: same('oz') },
  { key: 'lb', dimension: 'mass', toBase: 453.592, system: 'imperial', fractions: true, aliases: ['lb', 'lbs', 'lb.', 'pound', 'pounds', 'livre', 'livres', 'libra', 'libras', 'pfund', 'libbra', 'libbre'], labels: same('lb') },
  {
    key: 'pinch', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['pincee', 'pincees', 'pinch', 'pinches', 'pizca', 'pizcas', 'prise', 'prisen', 'pizzico', 'pizzichi'],
    labels: { fr: ['pincée', 'pincées'], en: ['pinch', 'pinches'], es: ['pizca', 'pizcas'], de: ['Prise', 'Prisen'], it: ['pizzico', 'pizzichi'] },
  },
  {
    key: 'clove', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['gousse', 'gousses', 'clove', 'cloves', 'diente', 'dientes', 'zehe', 'zehen', 'spicchio', 'spicchi'],
    labels: { fr: ['gousse', 'gousses'], en: ['clove', 'cloves'], es: ['diente', 'dientes'], de: ['Zehe', 'Zehen'], it: ['spicchio', 'spicchi'] },
  },
  {
    key: 'slice', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['tranche', 'tranches', 'slice', 'slices', 'rebanada', 'rebanadas', 'loncha', 'lonchas', 'scheibe', 'scheiben', 'fetta', 'fette'],
    labels: { fr: ['tranche', 'tranches'], en: ['slice', 'slices'], es: ['rebanada', 'rebanadas'], de: ['Scheibe', 'Scheiben'], it: ['fetta', 'fette'] },
  },
  {
    key: 'can', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['boite', 'boites', 'can', 'cans', 'tin', 'tins', 'lata', 'latas', 'dose', 'dosen', 'lattina', 'lattine', 'barattolo', 'barattoli', 'conserve', 'conserves'],
    labels: { fr: ['boîte', 'boîtes'], en: ['can', 'cans'], es: ['lata', 'latas'], de: ['Dose', 'Dosen'], it: ['barattolo', 'barattoli'] },
  },
  {
    key: 'packet', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['sachet', 'sachets', 'paquet', 'paquets', 'packet', 'packets', 'pack', 'packs', 'package', 'packages', 'sobre', 'sobres', 'paquete', 'paquetes', 'packchen', 'packung', 'packungen', 'bustina', 'bustine', 'confezione', 'confezioni'],
    labels: { fr: ['sachet', 'sachets'], en: ['packet', 'packets'], es: ['sobre', 'sobres'], de: ['Päckchen', 'Päckchen'], it: ['bustina', 'bustine'] },
  },
  {
    key: 'bunch', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['botte', 'bottes', 'bouquet', 'bouquets', 'bunch', 'bunches', 'manojo', 'manojos', 'bund', 'bunde', 'mazzo', 'mazzi', 'mazzetto'],
    labels: { fr: ['botte', 'bottes'], en: ['bunch', 'bunches'], es: ['manojo', 'manojos'], de: ['Bund', 'Bund'], it: ['mazzo', 'mazzi'] },
  },
  {
    key: 'sprig', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['brin', 'brins', 'branche', 'branches', 'sprig', 'sprigs', 'ramita', 'ramitas', 'rama', 'ramas', 'zweig', 'zweige', 'rametto', 'rametti', 'rametto'],
    labels: { fr: ['brin', 'brins'], en: ['sprig', 'sprigs'], es: ['ramita', 'ramitas'], de: ['Zweig', 'Zweige'], it: ['rametto', 'rametti'] },
  },
  {
    key: 'handful', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['poignee', 'poignees', 'handful', 'handfuls', 'punado', 'punados', 'handvoll', 'manciata', 'manciate'],
    labels: { fr: ['poignée', 'poignées'], en: ['handful', 'handfuls'], es: ['puñado', 'puñados'], de: ['Handvoll', 'Handvoll'], it: ['manciata', 'manciate'] },
  },
  {
    key: 'drop', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['goutte', 'gouttes', 'drop', 'drops', 'gota', 'gotas', 'tropfen', 'goccia', 'gocce'],
    labels: { fr: ['goutte', 'gouttes'], en: ['drop', 'drops'], es: ['gota', 'gotas'], de: ['Tropfen', 'Tropfen'], it: ['goccia', 'gocce'] },
  },
  {
    key: 'leaf', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['feuille', 'feuilles', 'leaf', 'leaves', 'hoja', 'hojas', 'blatt', 'blatter', 'foglia', 'foglie'],
    labels: { fr: ['feuille', 'feuilles'], en: ['leaf', 'leaves'], es: ['hoja', 'hojas'], de: ['Blatt', 'Blätter'], it: ['foglia', 'foglie'] },
  },
  {
    key: 'piece', dimension: 'count', toBase: 1, system: 'any', fractions: true,
    aliases: ['piece', 'pieces', 'pc', 'pcs', 'unite', 'unites', 'pieza', 'piezas', 'unidad', 'unidades', 'stuck', 'stk', 'stk.', 'pezzo', 'pezzi'],
    labels: { fr: ['pièce', 'pièces'], en: ['piece', 'pieces'], es: ['pieza', 'piezas'], de: ['Stück', 'Stück'], it: ['pezzo', 'pezzi'] },
  },
];

const BY_KEY = new Map(UNITS.map((u) => [u.key, u]));
/** Alias → unit, sorted longest first for greedy matching. */
export const UNIT_ALIASES: { alias: string; unit: UnitDef }[] = UNITS.flatMap((u) =>
  u.aliases.map((a) => ({ alias: normalizeText(a), unit: u })),
).sort((a, b) => b.alias.length - a.alias.length);

export function getUnit(key: string | null | undefined): UnitDef | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** Resolve free text ("c. à soupe", "Tbsp") to a unit key; unknown → undefined. */
export function resolveUnit(text: string): UnitDef | undefined {
  const n = normalizeText(text).replace(/\s*\.\s*$/, '');
  return UNIT_ALIASES.find((a) => a.alias === n || a.alias === n + '.')?.unit;
}

export function unitLabel(key: string | null | undefined, quantity: number | null, locale: Locale): string {
  if (!key) return '';
  const u = BY_KEY.get(key);
  if (!u) return key;
  const [sing, plural] = u.labels[locale];
  return quantity !== null && quantity > 1 ? plural : sing;
}

export function celsiusToFahrenheit(c: number): number {
  return Math.round(((c * 9) / 5 + 32) / 5) * 5;
}
export function fahrenheitToCelsius(f: number): number {
  return Math.round((((f - 32) * 5) / 9) / 5) * 5;
}
/** French oven "thermostat" scale: th. 6 ≈ 180 °C. */
export function thermostatToCelsius(th: number): number {
  return Math.round(th * 30);
}
