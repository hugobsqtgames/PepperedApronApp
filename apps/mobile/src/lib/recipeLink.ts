import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import {
  emptyDraft,
  parseIngredientLine,
  type RecipeData,
  type RecipeDraft,
} from '@pepperedapron/core';

/**
 * A recipe inside a link (pepperedapron://r/<data>), for a QR code: no server, the recipe itself
 * is in the code, compressed. When it does not fit, only the ingredients and steps are kept.
 */
export const LINK_PREFIX = 'pepperedapron://r/';
/** Beyond this a QR code becomes too dense for a phone camera at arm's length. */
export const MAX_LINK_LENGTH = 1800;

interface Packed {
  v: 1;
  t: string;
  s: number;
  i: string[];
  st: string[];
  p?: number | null;
  c?: number | null;
  o?: number | null;
  d?: string | null;
  n?: string | null;
  u?: string | null;
}

const toB64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

function ingredientLine(i: RecipeData['ingredients'][number]): string {
  const q = i.quantity === null ? '' : String(i.quantity);
  const qMax = i.quantityMax === null ? '' : `-${i.quantityMax}`;
  return [q + qMax, i.unit ?? '', i.name, i.note ? `(${i.note})` : ''].filter(Boolean).join(' ');
}

const payload = (p: Packed) => toB64Url(deflateSync(strToU8(JSON.stringify(p)), { level: 9 }));
const encode = (p: Packed) => LINK_PREFIX + payload(p);

/** A web link holds more than a QR code can: messages carry several thousand characters. */
export const MAX_WEB_LINK_LENGTH = 7000;

function packs(r: RecipeData): { full: Packed; base: Packed } {
  const base: Packed = {
    v: 1,
    t: r.title,
    s: r.servings,
    i: r.ingredients.map(ingredientLine),
    st: r.steps.map((s) => s.text),
  };
  const full: Packed = {
    ...base,
    p: r.prepMinutes,
    c: r.cookMinutes,
    o: r.ovenTemperatureC,
    d: r.description,
    n: r.tips,
    u: r.sourceUrl,
  };
  return { full, base };
}

/** The link for a recipe, or null when even its ingredients and steps are too long. */
export function recipeLink(r: RecipeData): { url: string; complete: boolean } | null {
  const { full, base } = packs(r);
  const url = encode(full);
  if (url.length <= MAX_LINK_LENGTH) return { url, complete: true };
  const short = encode(base);
  return short.length <= MAX_LINK_LENGTH ? { url: short, complete: false } : null;
}

/**
 * A web link to send in a message: the page of the website shows the recipe (it is in the part
 * after "#", which browsers never send to a server) and opens it in the app in one tap.
 */
export function webRecipeLink(
  r: RecipeData,
  siteUrl: string,
): { url: string; complete: boolean } | null {
  const { full, base } = packs(r);
  const at = `${siteUrl.replace(/\/+$/, '')}/r/#`;
  const url = at + payload(full);
  if (url.length <= MAX_WEB_LINK_LENGTH) return { url, complete: true };
  const short = at + payload(base);
  return short.length <= MAX_WEB_LINK_LENGTH ? { url: short, complete: false } : null;
}

/** The website's recipe page, on its free GitHub Pages address or on a domain of its own. */
const WEB_LINK =
  /^https:\/\/(?:(?:www\.)?pepperedapron\.app|hugobsqtgames\.github\.io\/PepperedApronApp)\/r\/?#([A-Za-z0-9_-]+)$/;

/** The recipe data in a shared link (app link, or a web link of the website), or null. */
export function linkPayload(url: string): string | null {
  const app = url.startsWith(LINK_PREFIX) ? url.slice(LINK_PREFIX.length) : null;
  if (app) return app.split(/[?#]/)[0] || null;
  const m = WEB_LINK.exec(url.trim());
  return m ? m[1]! : null;
}

/** The recipe in a scanned link, as a draft to review in the editor; null if unreadable. */
export function draftFromLink(data: string): RecipeDraft | null {
  try {
    const p = JSON.parse(strFromU8(inflateSync(fromB64Url(data)))) as Packed;
    if (p.v !== 1 || typeof p.t !== 'string') return null;
    const d = emptyDraft();
    d.title = p.t.slice(0, 200);
    d.servings = typeof p.s === 'number' ? p.s : null;
    // A QR code can be made by anyone: only as much as a recipe can hold is read.
    const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
    for (const l of list(p.i, 200)) {
      const ing = parseIngredientLine(String(l).slice(0, 500));
      if (ing) d.ingredients.push({ group: null, ...ing });
    }
    d.steps = list(p.st, 100).map((text) => ({
      group: null,
      text: String(text).slice(0, 5000),
      timerSeconds: null,
      timerLabel: null,
    }));
    d.prepMinutes = p.p ?? null;
    d.cookMinutes = p.c ?? null;
    d.ovenTemperatureC = p.o ?? null;
    d.description = p.d ?? null;
    d.tips = p.n ?? null;
    d.sourceUrl = p.u ?? null;
    return d;
  } catch {
    return null;
  }
}
