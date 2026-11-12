import { parseTimerSeconds } from '../duration';
import { normalizeText } from '../text';
import type { DraftStep } from './draft';
import { hasActionWord, startsWithAction } from './transcript';

/**
 * One action per step. Creators often write the whole method in a sentence or two ("Étaler la
 * pâte, ajouter la sauce, la mozzarella et enfourner 8 min à 250°C."), or several sentences in a
 * numbered step: each sentence becomes a step, and a long sentence is cut where a new instruction
 * starts (", ajouter…", " puis verser…", " et enfourner…", ", then bake…"). What is not an
 * instruction stays whole: "Quand le beurre est fondu, ajouter la farine" is one step.
 */

/** Words before a full stop that is not the end of a sentence: "1 c. à soupe", "env. 10 min". */
const ABBREVIATION = new Set(
  'c,cs,cc,cas,cac,cuil,cuill,env,approx,ex,qq,qqs,tbsp,tsp,oz,lb,lbs,no,vs,st,dr,mr,mme,ca,p,s,g,cl,ml,dl,kg'.split(
    ',',
  ),
);
/** A sentence that starts with these needs what follows: "Quand le beurre est fondu, …". */
const SUBORDINATE =
  /^(quand|lorsque|lorsqu|une fois|des que|si|s'il|pendant que|avant de|apres avoir|tant que|when|once|after|while|as soon as|if|before|until|jusqu)\b/;

/** Where a sentence may be cut: the next clause starts at the end of the match. */
const CLAUSE_CUT =
  /(?:\s*[,;]\s+(?:puis\s+|ensuite\s+|then\s+|and then\s+|et\s+|and\s+)?|\s+puis\s+|\s+(?:and )?then\s+|\s+et\s+|\s+and\s+)/giu;

/** Too short to be a step alone ("saler", "uncover"): kept with its neighbour. */
const MIN_WORDS = 2;
/** Shorter than this, a sentence is not cut into clauses. */
const LONG_SENTENCE = 35;

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Sentences of a text, also when they start without a capital ("divide the beef. heat a pan"). */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]+(?=\s+\S)/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const before = text.slice(start, m.index);
    const last = normalizeText(before.split(/\s+/).pop() ?? '').replace(/[^a-z0-9]/g, '');
    // Only the start of what follows matters (and long texts stay fast).
    const after = text.slice(end, end + 120).trimStart();
    // "4.5 kg", "1. Couper": a number, not a sentence end.
    if (/\d$/.test(before) && /^\d/.test(after)) continue;
    if (m[0] === '.' && ABBREVIATION.has(last) && !/^\p{Lu}/u.test(after)) continue;
    // A lowercase start is a new sentence only for an instruction ("… 8 balls. heat a pan").
    if (/^\p{Ll}/u.test(after) && !startsWithAction(after)) continue;
    // "… à 180°C ! Laisse refroidir" and "… prêt 😋 Bon appétit" alike.
    if (/^[\p{L}\p{N}«"“(]/u.test(after)) {
      out.push(text.slice(start, end).trim());
      start = end;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** The clauses of one sentence that each are an instruction. */
export function clausesOf(sentence: string): string[] {
  // Not a sentence a person wrote: left as it is.
  if (sentence.length < LONG_SENTENCE || sentence.length > 1500) return [sentence];
  const pieces: string[] = [];
  let start = 0;
  CLAUSE_CUT.lastIndex = 0;
  for (let m = CLAUSE_CUT.exec(sentence); m; m = CLAUSE_CUT.exec(sentence)) {
    const end = m.index + m[0].length;
    const head = sentence.slice(start, m.index);
    const rest = sentence.slice(end, end + 160);
    // "sel et poivre", "la farine et la levure": "et"/"and" only before a verb itself.
    const plainAnd = /^\s+(et|and)\s+$/i.test(m[0]);
    if (!startsWithAction(rest, plainAnd)) continue;
    // "Quand le beurre est fondu, ajouter…", "Pendant ce temps, poêler…": not an instruction alone.
    // (Once the main clause has come after its comma, the sentence can be cut further on.)
    if (!hasActionWord(head) || (SUBORDINATE.test(normalizeText(head.trim())) && !/,/.test(head)))
      continue;
    if (wordCount(head) < MIN_WORDS) continue;
    // What follows must be a step too: "puis uncover" alone is kept with the next clause.
    const next = rest.split(CLAUSE_CUT)[0] ?? rest;
    if (wordCount(next) < MIN_WORDS) continue;
    pieces.push(head);
    start = end;
  }
  pieces.push(sentence.slice(start));
  return pieces;
}

/** Capital first letter, a full stop at the end: "ajouter le sel" → "Ajouter le sel." */
function tidy(s: string): string {
  let t = s
    .trim()
    .replace(/^[,;:\s]+/, '')
    .replace(/[,;:\s]+$/, '');
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Ends on an emoji or punctuation already: left as it is.
  if (!/[.!?…)\]»"”]$|\p{Extended_Pictographic}️?$/u.test(t)) t += '.';
  return t;
}

/** "Bon appétit !", "Et voilà 😋": a sign-off, not a step. */
const SIGN_OFF =
  /^(bon app(etit)?|enjoy|et voila|voila|regalez[- ]vous|bonne degustation|buen provecho|guten appetit|buon appetito)\b\W*$/;

/** Each step cut into one action per step (see the top of this file). */
export function splitSteps(steps: DraftStep[]): DraftStep[] {
  const out: DraftStep[] = [];
  for (const st of steps) {
    const parts = sentencesOf(st.text)
      .flatMap(clausesOf)
      .map(tidy)
      .filter(
        (p) =>
          p &&
          !SIGN_OFF.test(
            normalizeText(p)
              .replace(/\p{Extended_Pictographic}/gu, '')
              .trim(),
          ),
      );
    if (parts.length <= 1) {
      out.push(parts.length ? { ...st, text: parts[0]! } : st);
      continue;
    }
    // A fragment too short to stand alone ("Salez." after a long sentence is fine; "Et." is not).
    const merged: string[] = [];
    for (const p of parts) {
      // Too short, or a remark that is no instruction ("J'adore les petites blagues…", "La pâte
      // doit être lisse."): kept with the instruction before it.
      if (
        merged.length &&
        ((wordCount(p) < MIN_WORDS && !startsWithAction(p)) || !hasActionWord(p))
      )
        merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`;
      else merged.push(p);
    }
    merged.forEach((text, i) =>
      out.push({
        group: st.group,
        text,
        timerSeconds:
          parseTimerSeconds(text) ?? (i === 0 && merged.length === 1 ? st.timerSeconds : null),
        timerLabel: i === 0 ? st.timerLabel : null,
      }),
    );
  }
  return out.slice(0, 60);
}
