import { convertAmount, formatAmount, getUnit, normalizeAmount, scaleAmount, unitLabel, celsiusToFahrenheit, type Ingredient, type Locale, type UnitSystem } from '@pepperedapron/core';

export function formatIngredient(i: Ingredient, factor: number, locale: Locale, system: UnitSystem): { amount: string; name: string; note: string | null } {
  let a = scaleAmount({ quantity: i.quantity, quantityMax: i.quantityMax, unit: i.unit }, factor);
  if (factor !== 1) a = normalizeAmount(a);
  a = convertAmount(a, system);
  const amount = formatAmount(a, locale);
  const unit = getUnit(a.unit) ? unitLabel(a.unit, a.quantityMax ?? a.quantity, locale) : (a.unit ?? '');
  return { amount: [amount, unit].filter(Boolean).join(' '), name: i.name, note: i.note };
}

export function formatOven(c: number, system: UnitSystem): string {
  return system === 'imperial' ? `${celsiusToFahrenheit(c)} °F` : `${c} °C`;
}

/** Plain-text version of a recipe for sharing to Messages, WhatsApp, Notes… */
export function recipeAsText(
  r: { title: string; description: string | null; servings: number; ingredients: Ingredient[]; steps: { text: string; group: string | null }[]; tips: string | null; sourceUrl: string | null },
  labels: { ingredients: string; steps: string; tips: string; servings: string },
  locale: Locale,
  system: UnitSystem,
): string {
  const lines = [r.title, ''];
  if (r.description) lines.push(r.description, '');
  lines.push(`${labels.ingredients} (${labels.servings})`);
  let group: string | null = null;
  for (const i of r.ingredients) {
    if (i.group && i.group !== group) lines.push('', `${i.group} :`);
    group = i.group;
    const f = formatIngredient(i, 1, locale, system);
    lines.push(`• ${[f.amount, f.name].filter(Boolean).join(' ')}${f.note ? ` (${f.note})` : ''}`);
  }
  lines.push('', labels.steps);
  r.steps.forEach((s, n) => lines.push(`${n + 1}. ${s.text}`));
  if (r.tips) lines.push('', `${labels.tips} : ${r.tips}`);
  if (r.sourceUrl) lines.push('', r.sourceUrl);
  return lines.join('\n');
}
