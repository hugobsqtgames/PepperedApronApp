import { parseIsoDuration, parseDurationText, parseTimerSeconds } from '../duration';
import { decodeHtmlEntities, stripHtml } from '../text';
import { emptyDraft, type DraftStep, type RecipeDraft } from './draft';
import { parseIngredientLine } from './ingredient';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

const isObj = (v: Json | undefined): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function hasType(o: Obj, type: string): boolean {
  const t = o['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function findRecipe(node: Json | undefined, depth = 0): Obj | null {
  if (depth > 6 || node === undefined || node === null) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (hasType(node, 'Recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function text(v: Json | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return stripHtml(v).trim() || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (isObj(v)) return text(v['name'] ?? v['text'] ?? v['@value']);
  return null;
}

function imageUrl(v: Json | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') return /^https?:\/\//i.test(v) ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = imageUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (isObj(v)) return imageUrl(v['url'] ?? v['contentUrl'] ?? v['@id']);
  return null;
}

function servings(v: Json | undefined): { n: number | null; label: string | null } {
  const list = Array.isArray(v) ? v : [v];
  for (const x of list) {
    if (typeof x === 'number' && x > 0 && x <= 100) return { n: Math.round(x), label: null };
    if (typeof x === 'string') {
      const m = x.match(/(\d{1,3})/);
      if (m) {
        const n = Number(m[1]);
        if (n > 0 && n <= 100) {
          const label = x.replace(m[1]!, '').trim() || null;
          return { n, label: label && label.length <= 40 && !/^(personnes?|servings?|portions?|people|persons?)$/i.test(label) ? label : null };
        }
      }
    }
  }
  return { n: null, label: null };
}

function steps(v: Json | undefined, group: string | null = null, out: DraftStep[] = []): DraftStep[] {
  if (!v) return out;
  if (typeof v === 'string') {
    const t = stripHtml(v);
    for (const line of t.split(/\n+/)) {
      const s = line.replace(/^\s*\d{1,2}\s*[.)]\s*/, '').trim();
      if (s) out.push({ group, text: s, timerSeconds: parseTimerSeconds(s), timerLabel: null });
    }
    return out;
  }
  if (Array.isArray(v)) {
    for (const x of v) steps(x, group, out);
    return out;
  }
  if (isObj(v)) {
    if (hasType(v, 'HowToSection')) {
      return steps(v['itemListElement'], text(v['name']) ?? group, out);
    }
    const t = text(v['text']) ?? text(v['name']) ?? text(v['description']);
    if (t) out.push({ group, text: t, timerSeconds: parseTimerSeconds(t), timerLabel: null });
    else if (v['itemListElement']) steps(v['itemListElement'], group, out);
  }
  return out;
}

function keywords(v: Json | undefined): string[] {
  const raw = Array.isArray(v) ? v.map((x) => text(x) ?? '') : (text(v) ?? '').split(',');
  return raw.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 1 && s.length <= 40).slice(0, 15);
}

export function extractJsonLdBlocks(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = m[1]!.trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try {
      out.push(JSON.parse(body) as Json);
    } catch {
      // Some sites put raw control characters inside strings; retry after escaping them.
      try {
        // eslint-disable-next-line no-control-regex
        out.push(JSON.parse(body.replace(/[\u0000-\u001f]+/g, ' ')) as Json);
      } catch {
        /* ignore invalid block */
      }
    }
  }
  return out;
}

/** schema.org/Recipe (JSON-LD) → draft. Returns null if the page has no Recipe object. */
export function parseJsonLdRecipe(html: string): RecipeDraft | null {
  let recipe: Obj | null = null;
  for (const block of extractJsonLdBlocks(html)) {
    recipe = findRecipe(block);
    if (recipe) break;
  }
  if (!recipe) return null;
  const d = emptyDraft();
  d.title = text(recipe['name']);
  d.description = text(recipe['description']);
  d.imageUrl = imageUrl(recipe['image']) ?? imageUrl(recipe['thumbnailUrl']);
  const s = servings(recipe['recipeYield']);
  d.servings = s.n;
  d.yieldLabel = s.label;
  const dur = (k: string) => {
    const v = recipe![k];
    const t = typeof v === 'string' ? v : null;
    return parseIsoDuration(t) ?? (t ? parseDurationText(t) : null);
  };
  d.prepMinutes = dur('prepTime');
  d.cookMinutes = dur('cookTime');
  d.totalMinutes = dur('totalTime');
  const ings = recipe['recipeIngredient'] ?? recipe['ingredients'];
  const lines = Array.isArray(ings) ? ings : typeof ings === 'string' ? ings.split('\n') : [];
  for (const l of lines) {
    const t = text(l);
    if (!t) continue;
    const p = parseIngredientLine(decodeHtmlEntities(t));
    if (p) d.ingredients.push({ group: null, ...p });
  }
  d.steps = steps(recipe['recipeInstructions']);
  d.tags = [...new Set([...keywords(recipe['keywords']), ...keywords(recipe['recipeCuisine'])])].slice(0, 20);
  const author = recipe['author'];
  d.author = text(Array.isArray(author) ? author[0] : author);
  return d;
}

/** OpenGraph / basic meta fallback for pages without JSON-LD (TikTok, Instagram, blogs). */
export function parseHtmlMeta(html: string): { title: string | null; description: string | null; image: string | null; siteName: string | null; author: string | null } {
  const head = html.slice(0, 300_000);
  const meta = (names: string[]): string | null => {
    for (const n of names) {
      const re1 = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${n}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i');
      const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${n}["']`, 'i');
      const m = head.match(re1) ?? head.match(re2);
      if (m?.[1]) return decodeHtmlEntities(m[1]).trim() || null;
    }
    return null;
  };
  const titleTag = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const image = meta(['og:image', 'og:image:url', 'twitter:image']);
  return {
    title: meta(['og:title', 'twitter:title']) ?? (titleTag ? decodeHtmlEntities(titleTag).trim() || null : null),
    description: meta(['og:description', 'description', 'twitter:description']),
    image: image && /^https?:\/\//i.test(image) ? image : null,
    siteName: meta(['og:site_name', 'application-name']),
    author: meta(['author', 'article:author']),
  };
}
