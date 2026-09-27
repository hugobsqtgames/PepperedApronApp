/** Lowercase, strip diacritics and ligatures, collapse whitespace. Used for search & matching. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Very small multilingual singularisation, good enough for matching ingredient names. */
export function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('aux') && word.length > 4) return word.slice(0, -3) + 'al';
  if (word.endsWith('eaux')) return word.slice(0, -1);
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s') || word.endsWith('x')) return word.slice(0, -1);
  return word;
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9']+/)
    .flatMap((t) => t.split("'"))
    .filter(Boolean);
}

/** Canonical key for merging ingredients ("Œufs" and "oeuf" → "oeuf"). */
export function ingredientKey(name: string): string {
  return tokenize(name).map(singularize).join(' ');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ucirc: 'û',
  ugrave: 'ù',
  icirc: 'î',
  iuml: 'ï',
  euml: 'ë',
  oelig: 'œ',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  ndash: '–',
  mdash: '—',
};

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(s: string): string {
  return decodeHtmlEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}
