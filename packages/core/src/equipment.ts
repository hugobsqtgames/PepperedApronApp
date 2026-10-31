import { normalizeText } from './text';

/**
 * Kitchen equipment a recipe needs, read from its title and steps (no AI): to find "something
 * without the oven", "for the air fryer" or "no cooking at all".
 */
export const EQUIPMENT = [
  'oven',
  'stovetop',
  'microwave',
  'airfryer',
  'pressureCooker',
  'foodProcessor',
  'blender',
  'barbecue',
  'noCook',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

const PATTERNS: Record<Exclude<Equipment, 'noCook'>, RegExp> = {
  oven: /\b(four|enfourn\w*|gratin\w*|th(?:ermostat)?\.? ?\d|oven|bake[ds]?|baking|roast(?:ed|ing)?|broil\w*|horno|ofen|forno)\b/,
  stovetop:
    /\b(poele|casserole|sauteuse|cocotte|faitout|wok|plaque|feu (?:doux|vif|moyen)|a feu|frire|frit|bouill\w*|mijot\w*|saut\w*|revenir|rissol\w*|frying pan|pot of|skillet|saucepan|stove\w*|boil\w*|simmer\w*|fry\w*|heat the oil|medium heat|high heat|low heat|sarten|pfanne|topf|padella)\b/,
  microwave: /\b(micro[ -]?ondes?|microwave\w*|microondas|mikrowelle)\b/,
  airfryer: /\b(air ?fryer|airfryer|friteuse sans huile|friteuse a air)\b/,
  pressureCooker:
    /\b(cookeo|autocuiseur|cocotte[ -]minute|instant ?pot|pressure cooker|multicuiseur|olla a presion|schnellkochtopf)\b/,
  foodProcessor:
    /\b(thermomix|monsieur cuisine|robot(?: culinaire| patissier| menager)?|kitchenaid|food processor|stand mixer|batteur|mixeur plongeant|hachoir)\b/,
  blender: /\b(blender|mixer|mixe[rz]?|mixant|smoothie|liquidiser|licuadora|mixeur)\b/,
  barbecue: /\b(barbecue|bbq|plancha|grill(?:ade)?s?|braise|grill(?:ed|ing)?)\b/,
};

/** Words that mean the dish is heated, whatever the appliance. */
const HEAT =
  /\b(cuire|cuisson|cuit[es]?|chauff\w*|bouill\w*|rotir|griller|dorer|fondre|caramelis\w*|cook(?:ed|ing)?|heat\w*|boil\w*|melt\w*|toast\w*|grill\w*)\b/;

export function recipeEquipment(r: {
  title: string;
  steps: { text: string }[];
  ovenTemperatureC?: number | null;
  cookMinutes?: number | null;
}): Equipment[] {
  let text = normalizeText([r.title, ...r.steps.map((s) => s.text)].join('\n'));
  const out = new Set<Equipment>();
  // "air fryer" is not frying in a pan: matched first, then taken out of the text.
  if (PATTERNS.airfryer.test(text)) {
    out.add('airfryer');
    text = text.replace(new RegExp(PATTERNS.airfryer.source, 'g'), ' ');
  }
  for (const [k, re] of Object.entries(PATTERNS) as [Exclude<Equipment, 'noCook'>, RegExp][])
    if (re.test(text)) out.add(k);
  if (r.ovenTemperatureC) out.add('oven');
  // An air fryer or a pressure cooker is not also "the oven" or "the stove" for the filters.
  if (out.has('airfryer')) out.delete('oven');
  if (out.has('pressureCooker')) out.delete('stovetop');
  if (out.has('foodProcessor') && /\b(thermomix|monsieur cuisine)\b/.test(text))
    out.delete('stovetop');
  const heated = [...out].some((e) =>
    ['oven', 'stovetop', 'microwave', 'airfryer', 'pressureCooker', 'barbecue'].includes(e),
  );
  if (!heated && !HEAT.test(text) && !r.cookMinutes) out.add('noCook');
  return EQUIPMENT.filter((e) => out.has(e));
}

/** Equipment named in a search ("sans four", "au airfryer", "sans cuisson"). */
const QUERY_WORDS: [RegExp, Equipment][] = [
  [/\bsans cuisson\b|\bno[ -]cook\b|\bno[ -]bake\b|\bsin coccion\b|\bohne kochen\b/, 'noCook'],
  [/\bair ?fryer\b|\bairfryer\b|\bfriteuse sans huile\b/, 'airfryer'],
  [
    /\bcookeo\b|\bautocuiseur\b|\bcocotte[ -]minute\b|\binstant ?pot\b|\bpressure cooker\b/,
    'pressureCooker',
  ],
  [/\bthermomix\b|\bmonsieur cuisine\b|\brobot\b|\bfood processor\b/, 'foodProcessor'],
  [/\bmicro[ -]?ondes?\b|\bmicrowave\b/, 'microwave'],
  [/\bbarbecue\b|\bbbq\b|\bplancha\b/, 'barbecue'],
  [/\bblender\b/, 'blender'],
  [/\bpoele\b|\bfeu\b|\bstovetop\b|\bstove\b/, 'stovetop'],
  [/\bfour\b|\boven\b|\bhorno\b|\bofen\b|\bforno\b/, 'oven'],
];
const WITHOUT = /\b(sans|without|sin|ohne|senza|no)\s+(?:de |le |la |l'|the )?$/;

/**
 * Equipment wanted or refused in a query, and the query without those words: "gratin sans four"
 * → without: oven, rest "gratin".
 */
export function parseEquipmentQuery(q: string): {
  equipment: Equipment[];
  without: Equipment[];
  rest: string;
} {
  let rest = normalizeText(q);
  const equipment: Equipment[] = [];
  const without: Equipment[] = [];
  for (const [re, e] of QUERY_WORDS) {
    const m = re.exec(rest);
    if (!m) continue;
    const before = rest.slice(0, m.index);
    const neg = WITHOUT.exec(before);
    if (e === 'noCook') equipment.push('noCook');
    else if (neg) without.push(e);
    else equipment.push(e);
    rest = (neg ? before.slice(0, neg.index) : before) + ' ' + rest.slice(m.index + m[0].length);
  }
  if (!equipment.length && !without.length) return { equipment, without, rest: q };
  // "au four", "a la poele": the little words left alone are dropped.
  rest = rest
    .replace(/\b(au|a la|a l|avec le|avec la|avec|with|in the|in|on the)\s*$/g, ' ')
    .replace(/\s+(au|a la|avec|with)\s+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { equipment: [...new Set(equipment)], without: [...new Set(without)], rest };
}

/** True when the recipe has all of `need` and none of `without`. */
export function equipmentMatches(
  has: Equipment[],
  need: Equipment[],
  without: Equipment[],
): boolean {
  return need.every((e) => has.includes(e)) && !without.some((e) => has.includes(e));
}
