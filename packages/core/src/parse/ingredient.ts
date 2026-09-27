import { NUMBER_PATTERN, parseNumber } from '../quantity';
import { UNIT_ALIASES } from '../units';
import { normalizeText } from '../text';

export interface ParsedIngredient {
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  note: string | null;
}

const WORD_NUMBERS: Record<string, number> = {
  // fr
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  dix: 10,
  douze: 12,
  demi: 0.5,
  demie: 0.5,
  // en
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  eight: 8,
  ten: 10,
  twelve: 12,
  half: 0.5,
  dozen: 12,
  // es / it
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  mezzo: 0.5,
  mezza: 0.5,
  medio: 0.5,
  media: 0.5,
  // de
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  funf: 5,
  sechs: 6,
  halbe: 0.5,
  halber: 0.5,
};

const BULLET_RE = /^\s*(?:[-–—•*·▪▫◦●○✓✔☐▢□>]+|\d+\s*[.)]\s+(?=\D))\s*/;
const CONNECTOR_RE =
  /^(?:de la |de l'|de l’|du |des |de |d'|d’|of |di |del |della |dello |dei |degli |delle |de los |de las |von |vom )/i;
const RANGE_SEP = '(?:-|–|—|à|to|bis|a|o)';

function stripConnector(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 2; i++) {
    const m = out.match(CONNECTOR_RE);
    if (!m) break;
    out = out.slice(m[0].length).trim();
  }
  return out;
}

/** Match a unit alias at the start of `s` (which follows a number). */
function matchUnit(s: string): { key: string; length: number } | null {
  const norm = normalizeText(s.slice(0, 40));
  // normalizeText may drop characters (diacritics are 1:1 in NFD-stripped form; whitespace collapses).
  for (const { alias, unit } of UNIT_ALIASES) {
    if (!norm.startsWith(alias)) continue;
    const next = norm.charAt(alias.length);
    if (next && /[a-z0-9]/.test(next) && !/[.]$/.test(alias)) continue;
    // Map normalized length back onto the raw string by walking characters.
    let rawLen = 0;
    let consumed = 0;
    while (rawLen < s.length && consumed < alias.length) {
      const piece = normalizeText(s.slice(0, rawLen + 1));
      consumed = piece.length;
      rawLen++;
    }
    return { key: unit.key, length: rawLen };
  }
  return null;
}

function splitNote(rest: string): { name: string; note: string | null } {
  let name = rest.trim();
  const notes: string[] = [];
  const paren = name.match(/\(([^)]*)\)/);
  if (paren) {
    if (paren[1]!.trim()) notes.push(paren[1]!.trim());
    name = (name.slice(0, paren.index) + name.slice(paren.index! + paren[0].length))
      .replace(/\s+/g, ' ')
      .trim();
  }
  const comma = name.indexOf(',');
  if (comma > 0) {
    notes.push(name.slice(comma + 1).trim());
    name = name.slice(0, comma).trim();
  }
  return { name, note: notes.filter(Boolean).join(', ') || null };
}

function cleanName(s: string): string {
  return s.replace(/^[\s:;,\-–]+|[\s:;,.\-–]+$/g, '').replace(/\s+/g, ' ');
}

/**
 * Parse one ingredient line. Deterministic, multilingual (fr/en/es/de/it).
 * "200 g de farine (tamisée)" → { quantity: 200, unit: 'g', name: 'farine', note: 'tamisée' }
 */
export function parseIngredientLine(input: string): ParsedIngredient | null {
  const line = input
    .replace(/\u00a0/g, ' ')
    .replace(BULLET_RE, '')
    .trim();
  if (!line) return null;

  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let rest = line;

  const numRe = new RegExp(
    `^(${NUMBER_PATTERN})(?:\\s*${RANGE_SEP}\\s*(${NUMBER_PATTERN}))?(?=\\s|[a-zA-Zµ°'’(]|$)`,
    'i',
  );
  const m = line.match(numRe);
  if (m) {
    quantity = parseNumber(m[1]!);
    const max = m[2] ? parseNumber(m[2]) : null;
    quantityMax = max !== null && quantity !== null && max > quantity ? max : null;
    rest = line.slice(m[0].length).trim();
  } else {
    const w = line.match(/^([A-Za-zÀ-ÿ]+)\s+/);
    const val = w ? WORD_NUMBERS[normalizeText(w[1]!)] : undefined;
    if (w && val !== undefined) {
      const after = line.slice(w[0].length);
      // Only accept word numbers if followed by a unit or a plausible noun (avoid "a lot of").
      if (matchUnit(after) || !/^(lot|little|bit|few|peu|poco|wenig)\b/i.test(after)) {
        quantity = val;
        rest = after.trim();
      }
    }
  }

  let unit: string | null = null;
  if (quantity !== null) {
    const u = matchUnit(rest);
    if (u) {
      unit = u.key;
      rest = rest
        .slice(u.length)
        .replace(/^\.\s*/, '')
        .trim();
    }
    rest = stripConnector(rest);
  } else {
    // "Farine : 200 g" / "Flour - 200g"
    const tail = line.match(new RegExp(`^(.+?)\\s*[:\\-–]\\s*(${NUMBER_PATTERN})\\s*(.*)$`));
    if (tail) {
      const q = parseNumber(tail[2]!);
      const u = tail[3] ? matchUnit(tail[3]) : null;
      if (q !== null && (!tail[3] || (u && u.length >= tail[3].trim().length - 1))) {
        return {
          name: cleanName(tail[1]!),
          quantity: q,
          quantityMax: null,
          unit: u?.key ?? null,
          note: null,
        };
      }
    }
  }

  if (quantity !== null && !(quantity > 0)) quantity = null;
  const { name, note } = quantity !== null ? splitNote(rest) : { name: rest, note: null };
  const finalName = cleanName(name);
  if (!finalName) {
    if (quantity === null) return null;
    return { name: cleanName(rest) || line, quantity, quantityMax, unit, note };
  }
  return { name: finalName, quantity, quantityMax, unit, note };
}
