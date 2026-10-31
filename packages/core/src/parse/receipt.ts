import type { PantryPlace } from '../schemas';
import { categorizeIngredient } from '../shopping';
import { normalizeText } from '../text';
import { getUnit } from '../units';

/**
 * A supermarket receipt read by text recognition, turned into things to put away: the product
 * lines are kept (prices, totals, payment and store lines are dropped), the names made readable,
 * weights and sizes read, and a place guessed (fridge, freezer or cupboard).
 */
export interface OcrLine {
  text: string;
  /** Position on the picture, 0–1 from the top left (optional: plain text works too). */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ReceiptItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  place: PantryPlace;
  /** Not food (washing powder, paper…): offered but not ticked. */
  food: boolean;
}

/** Pieces of text next to each other on the same printed line are put back together. */
export function receiptRows(lines: OcrLine[]): string[] {
  if (!lines.some((l) => l.y !== undefined)) return lines.map((l) => l.text);
  const placed = lines
    .filter((l) => l.text.trim())
    .map((l) => ({
      text: l.text.trim(),
      x: l.x ?? 0,
      mid: (l.y ?? 0) + (l.height ?? 0) / 2,
      h: l.height ?? 0.02,
    }))
    .sort((a, b) => a.mid - b.mid);
  const rows: { mid: number; h: number; parts: { x: number; text: string }[] }[] = [];
  for (const l of placed) {
    const row = rows.find((r) => Math.abs(r.mid - l.mid) < Math.min(r.h, l.h) * 0.6);
    if (row) row.parts.push({ x: l.x, text: l.text });
    else rows.push({ mid: l.mid, h: l.h, parts: [{ x: l.x, text: l.text }] });
  }
  return rows.map((r) =>
    r.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.text)
      .join(' '),
  );
}

/** Lines that are never products: totals, payment, taxes, store, loyalty, dates. */
const NOT_PRODUCT =
  /\b(total|sous[ -]?total|s\/total|a payer|net a payer|tva|t\.v\.a|ht|ttc|cb|carte|visa|mastercard|contact ?less|sans contact|especes|rendu|monnaie|merci|ticket|caisse|caissier|caissiere|magasin|siret|siren|rcs|tel|telephone|www|http|fidelite|avantage|cagnotte|remise|reduction|promo|economie|bon d.achat|points?|solde|client|n° ?\d|transaction|autorisation|montant|debit|euro?s?|eur|articles?|nombre|qte|quantite|date|heure|subtotal|tax|change|cash|card|thank|receipt|store|items?|balance|savings|discount|coupon|paid|member)\b/;
const DATE_OR_TIME = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}[:h]\d{2}(?::\d{2})?\b/;
const PRICE = /(-?\d{1,4}[.,]\d{2})\s*(?:€|eur|e)?\s*[a-z]?\s*$/i;
/** "2 x 1,25", "2X", "x3" around a product. */
const MULTIPLY = /(?:^|\s)(\d{1,2})\s*[x×*]\s*(?:\d{1,4}[.,]\d{2})?|\s[x×*]\s*(\d{1,2})\b/i;
/** "0,512 kg x 2,99 €/kg": the weight bought. */
const WEIGHED = /(\d{1,3}[.,]\d{1,3})\s*kg\s*[x×*]/i;
/** "LAIT 1L", "500G", "6X125G", "75CL". */
const SIZE = /\b(?:(\d{1,2})\s*[x×*]\s*)?(\d{1,4}(?:[.,]\d{1,3})?)\s*(kg|g|gr|l|cl|ml)\b/i;

/** Frequent abbreviations of French and English receipts. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\b1\/2 ?ecr(?:eme)?\b/g, 'demi-écrémé'],
  [/\bdemi ?ecr\b/g, 'demi-écrémé'],
  [/\becr\b/g, 'écrémé'],
  [/\bpdt\b|\bp\.? ?de ?t(?:erre)?\b/g, 'pommes de terre'],
  [/\bfrom\b/g, 'fromage'],
  [/\bfrais?\b/g, 'frais'],
  [/\bjamb\b/g, 'jambon'],
  [/\bpoul\b/g, 'poulet'],
  [/\bfil\b/g, 'filet'],
  [/\bsauc\b/g, 'saucisse'],
  [/\byaou?rt?s?\b|\byt\b/g, 'yaourt'],
  [/\bchoc\b/g, 'chocolat'],
  [/\bbq\b|\bbte\b/g, 'boîte'],
  [/\bsurg\b/g, 'surgelé'],
  [/\blgm\b|\bleg\b/g, 'légumes'],
  [/\bbio\b/g, 'bio'],
  [/\bcrm\b|\bcr\b(?= fraiche| epaisse| liquide)/g, 'crème'],
  [/\bbt\b/g, 'beurre'],
  [/\boeufs? pa\b|\boeufs? plein air\b/g, 'œufs plein air'],
  [/\boeufs?\b/g, 'œufs'],
];
/** Store-brand words that say nothing about the product. */
const BRANDS =
  /\b(crf|carrefour|classic|auchan|leclerc|marque repere|eco\+?|u bio|monoprix|monop|intermarche|lidl|aldi|franprix|casino|cora|super u|systeme u|tous les jours|premier prix|simpl|la marque|nos regions ont du talent|reflets de france|great value|kirkland|tesco|sainsbury'?s)\b/g;
const NON_FOOD =
  /\b(lessive|adoucissant|papier|essuie|mouchoir|sac|sacs|cabas|pile|piles|ampoule|eponge|liquide vaisselle|dentifrice|shampo\w*|gel douche|savon|deodorant|couche|couches|lingette|sopalin|alu|aluminium|film|detergent|nettoyant|javel|detergent|toilet|paper|bag|bags|soap|shampoo|battery|tissues|trash)\b/;
/** Kept out of the fridge even if fresh. */
const CUPBOARD_PRODUCE =
  /\b(pommes? de terre|patates?|oignons?|echalotes?|ail|bananes?|pommes?|oranges?|citrons?|clementines?|mandarines?|avocats?|tomates?|courges?|potirons?|potato(?:es)?|onions?|garlic|bananas?|apples?|lemons?)\b/;

/** Where a product is kept: freezer, fridge (fresh dairy, meat, fish, most vegetables) or cupboard. */
export function pantryPlaceFor(name: string): PantryPlace {
  const n = normalizeText(name);
  if (/\b(surgel\w*|congel\w*|glace|glaces|frozen|ice cream)\b/.test(n)) return 'freezer';
  const cat = categorizeIngredient(name);
  if (cat === 'frozen') return 'freezer';
  if (cat === 'dairy_eggs' || cat === 'meat_fish') return /\boeuf/.test(n) ? 'pantry' : 'fridge';
  if (cat === 'produce') return CUPBOARD_PRODUCE.test(n) ? 'pantry' : 'fridge';
  return 'pantry';
}

function readable(raw: string): string {
  let n = normalizeText(raw)
    .replace(/[_*#|<>]+/g, ' ')
    .replace(/\s+/g, ' ');
  for (const [re, by] of ABBREVIATIONS) n = n.replace(re, by);
  n = n
    .replace(BRANDS, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return n ? n[0]!.toUpperCase() + n.slice(1) : n;
}

/** The products of a receipt, in the order printed, without duplicates (quantities added). */
export function parseReceipt(lines: OcrLine[] | string[]): ReceiptItem[] {
  const rows = receiptRows(
    (lines as (OcrLine | string)[]).map((l) => (typeof l === 'string' ? { text: l } : l)),
  );
  const out: ReceiptItem[] = [];
  let lastProduct: ReceiptItem | null = null;
  const plains = rows.map(normalizeText);
  const ALONE = /^(\d{1,2})\s*[x×*]\s*\d{1,4}[.,]\d{2}\s*(?:€|eur)?\s*$/i;
  // A product line ends with its price, or has its weight / count on the next line (store name,
  // address and slogans have none). Without any price on the receipt, every line is a candidate.
  const priced = plains.some((p) => PRICE.test(p));
  const isCandidate = (i: number) =>
    !priced ||
    PRICE.test(plains[i]!) ||
    WEIGHED.test(plains[i + 1] ?? '') ||
    ALONE.test(plains[i + 1] ?? '');
  for (let i = 0; i < rows.length; i++) {
    const plain = plains[i]!;
    // "2 x 1,25" alone on its line: the number of the product just above.
    const alone = ALONE.exec(plain);
    if (alone && lastProduct) {
      const n = Number(alone[1]);
      lastProduct.quantity =
        lastProduct.unit && lastProduct.quantity !== null ? lastProduct.quantity * n : n;
      continue;
    }
    const weighed = WEIGHED.exec(plain);
    if (weighed && lastProduct && !/[a-z]{3}/.test(plain.replace(/kg|eur|x/g, ''))) {
      lastProduct.quantity = Math.round(Number(weighed[1]!.replace(',', '.')) * 1000);
      lastProduct.unit = 'g';
      continue;
    }
    if (NOT_PRODUCT.test(plain) || DATE_OR_TIME.test(plain) || !isCandidate(i)) {
      lastProduct = null;
      continue;
    }
    let text = plain.replace(PRICE, ' ');
    let count: number | null = null;
    const mul = MULTIPLY.exec(text);
    if (mul) {
      count = Number(mul[1] ?? mul[2]);
      text = text.replace(mul[0], ' ');
    }
    let quantity: number | null = count;
    let unit: string | null = null;
    const size = SIZE.exec(text);
    if (size) {
      const packs = size[1] ? Number(size[1]) : 1;
      const amount = Number(size[2]!.replace(',', '.')) * packs * (count ?? 1);
      const key = size[3]!.toLowerCase() === 'gr' ? 'g' : size[3]!.toLowerCase();
      if (getUnit(key) && amount > 0) {
        quantity = Math.round(amount * 1000) / 1000;
        unit = key;
        text = text.replace(size[0], ' ');
      }
    }
    const name = readable(text);
    // A product line has a real word in it (not just codes or a lone price).
    if (!/\p{L}{3,}/u.test(name) || name.length > 60) {
      lastProduct = null;
      continue;
    }
    const same = out.find((i) => normalizeText(i.name) === normalizeText(name) && i.unit === unit);
    if (same) {
      // The same product twice: the quantities (or the number of items) add up.
      same.quantity = (same.quantity ?? 1) + (quantity ?? 1);
      lastProduct = same;
      continue;
    }
    const item: ReceiptItem = {
      name,
      quantity,
      unit,
      place: pantryPlaceFor(name),
      food: !NON_FOOD.test(normalizeText(name)),
    };
    out.push(item);
    lastProduct = item;
  }
  return out;
}

/** The size printed on a pack ("500 g", "1 L", "6 x 125 g", "75 cl"), or nulls. */
export function packSize(text: string | null | undefined): {
  quantity: number | null;
  unit: string | null;
} {
  const m = SIZE.exec(normalizeText(text ?? ''));
  if (!m) return { quantity: null, unit: null };
  const amount = Number(m[2]!.replace(',', '.')) * (m[1] ? Number(m[1]) : 1);
  const unit = m[3]!.toLowerCase() === 'gr' ? 'g' : m[3]!.toLowerCase();
  return amount > 0 && getUnit(unit)
    ? { quantity: Math.round(amount * 1000) / 1000, unit }
    : { quantity: null, unit: null };
}
