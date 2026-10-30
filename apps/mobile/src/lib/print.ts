import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  computeTotalMinutes,
  formatMinutes,
  type Locale,
  type UnitSystem,
} from '@pepperedapron/core';
import type { Recipe } from '@pepperedapron/client';
import i18n from '../i18n';
import { formatIngredient, formatOven } from './format';
import { recipePhotoUri } from './media';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** The app's look on paper: cream and green, Fraunces titles (Georgia when not available). */
const CSS = `
@page { margin: 18mm 16mm; }
body { font-family: -apple-system, 'Helvetica Neue', sans-serif; color: #1F2A24; font-size: 11.5pt; line-height: 1.45; }
h1, h2 { font-family: 'Fraunces', Georgia, serif; color: #1F4D3A; margin: 0 0 6pt; }
h1 { font-size: 24pt; line-height: 1.15; }
h2 { font-size: 14pt; margin-top: 16pt; border-bottom: 1.5pt solid #E8DFCF; padding-bottom: 3pt; }
.meta { color: #5E655F; margin-bottom: 10pt; }
.photo { width: 100%; max-height: 82mm; object-fit: cover; border-radius: 10pt; margin: 6pt 0 10pt; }
.cols { display: flex; gap: 16pt; }
.ings { flex: 0 0 36%; }
.steps { flex: 1; }
ul { padding-left: 0; list-style: none; margin: 0; }
li { margin: 0 0 4pt; }
.amt { color: #D2642A; font-weight: 700; }
ol { margin: 0; padding-left: 16pt; }
ol li { margin-bottom: 7pt; }
.group { font-weight: 700; color: #A84A1A; margin-top: 8pt; }
.note { background: #F7F1E6; border-radius: 8pt; padding: 8pt 10pt; margin-top: 12pt; }
.recipe { page-break-after: always; }
.recipe:last-child { page-break-after: auto; }
.cover { height: 230mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
.cover h1 { font-size: 34pt; }
.foot { color: #5E655F; font-size: 9pt; margin-top: 14pt; }
`;

async function photoData(r: Recipe): Promise<string | null> {
  const uri = recipePhotoUri(r);
  if (!uri) return null;
  try {
    return `data:image/jpeg;base64,${await new File(uri).base64()}`;
  } catch {
    return null;
  }
}

async function recipeHtml(r: Recipe, system: UnitSystem): Promise<string> {
  const t = i18n.t.bind(i18n);
  const locale = i18n.language as Locale;
  const d = r.data;
  const minutes = computeTotalMinutes(d);
  const meta = [
    t('common.servings', { count: d.servings }),
    minutes ? formatMinutes(minutes, locale) : null,
    d.ovenTemperatureC ? t('recipe.oven', { temp: formatOven(d.ovenTemperatureC, system) }) : null,
  ].filter(Boolean);
  const photo = await photoData(r);
  let group: string | null = null;
  const ings = d.ingredients
    .map((i) => {
      const head = i.group && i.group !== group ? `<li class="group">${esc(i.group)}</li>` : '';
      group = i.group;
      const f = formatIngredient(i, 1, locale, system);
      return `${head}<li>${f.amount ? `<span class="amt">${esc(f.amount)}</span> ` : ''}${esc(f.name)}${f.note ? ` <em>(${esc(f.note)})</em>` : ''}</li>`;
    })
    .join('');
  const steps = d.steps.map((s) => `<li>${esc(s.text)}</li>`).join('');
  const notes = [d.tips, d.personalNote].filter(Boolean) as string[];
  return `<section class="recipe">
<h1>${esc(d.title)}</h1>
<div class="meta">${meta.map((m) => esc(String(m))).join(' · ')}</div>
${photo ? `<img class="photo" src="${photo}">` : ''}
${d.description ? `<p>${esc(d.description)}</p>` : ''}
<div class="cols">
  <div class="ings"><h2>${esc(t('recipe.ingredients'))}</h2><ul>${ings}</ul></div>
  <div class="steps"><h2>${esc(t('recipe.steps'))}</h2><ol>${steps}</ol></div>
</div>
${notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}
${d.sourceUrl ? `<div class="foot">${esc(d.sourceUrl)}</div>` : ''}
</section>`;
}

/** One recipe, or a collection as a booklet (cover, then one recipe per page). */
export async function recipesHtml(
  recipes: Recipe[],
  system: UnitSystem,
  booklet: string | null = null,
): Promise<string> {
  const pages = await Promise.all(recipes.map((r) => recipeHtml(r, system)));
  const cover = booklet
    ? `<section class="cover"><h1>${esc(booklet)}</h1><p>${esc(i18n.t('common.recipes', { count: recipes.length }))}</p><p class="foot">PepperedApron</p></section>`
    : '';
  return `<!doctype html><html lang="${i18n.language}"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cover}${pages.join('')}</body></html>`;
}

export async function printRecipes(recipes: Recipe[], system: UnitSystem, booklet?: string) {
  await Print.printAsync({ html: await recipesHtml(recipes, system, booklet ?? null) });
}

/** A PDF to keep or send (Mail, Files, AirDrop…), through the share sheet. */
export async function shareRecipesPdf(recipes: Recipe[], system: UnitSystem, booklet?: string) {
  const { uri } = await Print.printToFileAsync({
    html: await recipesHtml(recipes, system, booklet ?? null),
  });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
