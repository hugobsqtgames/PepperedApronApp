import { ingredientKey, normalizeText, singularize, tokenize } from './text';

const TRACKING =
  /^(utm_|fbclid$|gclid$|igsh$|igshid$|si$|ref$|share|_r$|_t$|is_from_webapp$|sender_device$|feature$|mibextid$)/i;

/**
 * One key per publication, whatever the shape of the link: "instagram.com/reel/X?igsh=…" and
 * "instagram.com/p/X/" give "instagram:X"; tracking parameters are ignored.
 */
export function canonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  let m: RegExpMatchArray | null;
  if (host.endsWith('instagram.com') && (m = path.match(/\/(?:p|reels?|tv)\/([\w-]+)/)))
    return `instagram:${m[1]}`;
  if (host.endsWith('tiktok.com') && (m = path.match(/\/(?:video|photo)\/(\d+)/)))
    return `tiktok:${m[1]}`;
  if (host === 'youtu.be' && path.length > 1) return `youtube:${path.slice(1)}`;
  if (host.endsWith('youtube.com')) {
    const v = u.searchParams.get('v');
    if (v) return `youtube:${v}`;
    if ((m = path.match(/\/(?:shorts|embed|live)\/([\w-]+)/))) return `youtube:${m[1]}`;
  }
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${host}${path}${params ? `?${params}` : ''}`;
}

const TITLE_STOP = new Set(
  'de du des la le les l d un une et a au aux en avec sans pour facon maison recette the a an and of with without for recipe my easy best'.split(
    ' ',
  ),
);

function titleWords(title: string): Set<string> {
  return new Set(
    tokenize(title)
      .map(singularize)
      .filter((w) => !TITLE_STOP.has(w) && !/^\d+$/.test(w)),
  );
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface DuplicateCandidate {
  title: string;
  sourceUrl: string | null;
  ingredientNames: string[];
  /** The steps' text, when known: the same steps word for word make the same recipe. */
  stepTexts?: string[];
}

/** Words of the method, to compare two recipes' steps. */
function stepWords(steps: string[] | undefined): Set<string> {
  return new Set((steps ?? []).flatMap((s) => tokenize(s).map(singularize)));
}

export interface DuplicateMatch {
  id: string;
  /** Same publication (link), or a very similar recipe (title and ingredients). */
  reason: 'link' | 'similar';
}

/** An existing recipe that looks like the same as the candidate, if any. */
export function findDuplicate(
  candidate: DuplicateCandidate,
  existing: (DuplicateCandidate & { id: string })[],
): DuplicateMatch | null {
  const url = canonicalUrl(candidate.sourceUrl);
  if (url) {
    const same = existing.find((r) => canonicalUrl(r.sourceUrl) === url);
    if (same) return { id: same.id, reason: 'link' };
  }
  const words = titleWords(candidate.title);
  if (!words.size) return null;
  const ings = new Set(candidate.ingredientNames.map(ingredientKey).filter(Boolean));
  let best: { id: string; score: number } | null = null;
  for (const r of existing) {
    const t = jaccard(words, titleWords(r.title));
    if (t < 0.75) continue;
    const theirs = new Set(r.ingredientNames.map(ingredientKey).filter(Boolean));
    // Two different publications are two recipes, even with the same name — unless they are
    // the same recipe word for word (the same post imported from Instagram and from Pinterest).
    const other = canonicalUrl(r.sourceUrl);
    if (url && other && other !== url) {
      const mySteps = stepWords(candidate.stepTexts);
      const theirSteps = stepWords(r.stepTexts);
      const sameContent =
        t >= 0.9 &&
        ings.size >= 3 &&
        theirs.size >= 3 &&
        jaccard(ings, theirs) >= 0.9 &&
        mySteps.size >= 5 &&
        theirSteps.size >= 5 &&
        jaccard(mySteps, theirSteps) >= 0.8;
      if (!sameContent) continue;
    }
    // Without ingredients on one side, only an identical title counts.
    const sameTitle = normalizeText(r.title) === normalizeText(candidate.title);
    const i = ings.size >= 2 && theirs.size >= 2 ? jaccard(ings, theirs) : sameTitle ? 1 : 0;
    if (i < 0.5) continue;
    const score = t + i;
    if (!best || score > best.score) best = { id: r.id, score };
  }
  return best ? { id: best.id, reason: 'similar' } : null;
}
