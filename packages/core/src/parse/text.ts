import { parseDurationText, parseTimerSeconds } from '../duration';
import { normalizeText } from '../text';
import { fahrenheitToCelsius, thermostatToCelsius } from '../units';
import { emptyDraft, type RecipeDraft } from './draft';
import { parseIngredientLine } from './ingredient';

type Section = 'none' | 'ingredients' | 'steps' | 'tips' | 'notes';

const H = (words: string[]) =>
  new RegExp(
    `^(?:(?:les|la|l'|mes|nos|the|my)\\s*)?(?:${words.join('|')})\\s*(?:\\(.*\\))?\\s*[:：]?$`,
    'i',
  );

const HEADERS: [Section, RegExp][] = [
  [
    'ingredients',
    H([
      'ingredients?',
      'ingredientes?',
      'zutaten',
      'ingredienti',
      'liste des ingredients',
      'what you need',
      'vous aurez besoin de',
      'il vous faut',
      'il te faut',
      "ce qu'il (?:te|vous) faut",
      'tu as besoin de',
      'liste de courses',
      'courses',
      'you will need',
      'necesitas',
      'du brauchst',
      'occorrente',
    ]),
  ],
  [
    'steps',
    H([
      'preparation',
      'preparations',
      'etapes?',
      'instructions?',
      'method',
      'methode',
      'directions?',
      'recette',
      'deroulement',
      'steps?',
      'how to make( it)?',
      'preparacion',
      'elaboracion',
      'pasos',
      'instrucciones',
      'zubereitung',
      'anleitung',
      'procedimento',
      'preparazione',
      'istruzioni',
      'realisation',
      'la recette',
      'comment (?:la |le |les )?faire',
      'deroule',
      'marche a suivre',
      'how to',
    ]),
  ],
  [
    'tips',
    H([
      'astuces?',
      'conseils?',
      'tips?',
      'trucs?',
      'consejos?',
      'trucos?',
      'tipps?',
      'consigli',
      'suggerimenti',
      'le conseil du chef',
      "chef's tips?",
    ]),
  ],
  ['notes', H(['notes?', 'remarques?', 'notas?', 'hinweise?', 'anmerkungen', 'note'])],
];

const SERVINGS_RES = [
  /\b(?:pour|serves|for|para|fur|per|makes|donne)\s*:?\s*(\d{1,3})(?:\s*(?:-|a|à|to)\s*\d{1,3})?\s*(personnes?|pers\.?|people|persons?|portions?|servings?|parts?|personas|raciones|porciones|personen|portionen|persone|porzioni|stucks?|pieces?|pieces)?\b/i,
  /\b(\d{1,3})\s*(personnes?|pers\.|people|persons|portions?|servings?|parts|personas|raciones|porciones|personen|portionen|persone|porzioni)\b/i,
  /\b(?:portions?|servings?|rendement|yield|raciones|porciones|portionen|porzioni|personnes|nombre de parts)\s*[:：]\s*(\d{1,3})/i,
];

const TIME_LABELS: [
  keyof Pick<RecipeDraft, 'prepMinutes' | 'cookMinutes' | 'restMinutes' | 'totalMinutes'>,
  RegExp,
][] = [
  [
    'prepMinutes',
    /\b(?:temps de preparation|preparation|prep(?:aration)? time|prep|preparacion|tiempo de preparacion|zubereitungszeit|vorbereitung(?:szeit)?|arbeitszeit|preparazione|tempo di preparazione)\b/i,
  ],
  [
    'cookMinutes',
    /\b(?:temps de cuisson|cuisson|cook(?:ing)? time|cook|bake time|baking time|coccion|tiempo de coccion|horneado|backzeit|kochzeit|garzeit|cottura|tempo di cottura)\b/i,
  ],
  [
    'restMinutes',
    /\b(?:temps de repos|repos|refrigeration|rest(?:ing)? time|chill(?:ing)? time|reposo|ruhezeit|kuhlzeit|riposo)\b/i,
  ],
  ['totalMinutes', /\b(?:temps total|total time|total|tiempo total|gesamtzeit|tempo totale)\b/i],
];

const STEP_PREFIX =
  /^\s*(?:(?:etape|step|paso|schritt|passo|passaggio)\s*\d+\s*[:.)-]?|\d{1,2}\s*[.)/-]|\d{1,2}\s*[️⃣]+|[①-⑳]|[-–•*·▪]\s)\s*/i;
const GROUP_RE =
  /^(?:pour (?:la |le |les |l'|l’)?|for the |para (?:el |la |los |las )?|fur (?:den |die |das )?|per (?:il |la |lo |i |le )?)(.{2,50}?)\s*[:：]?$/i;

/** "Ingrédients pour 2 personnes :", "Ingredients (serves 4):", "Zutaten für 6 Stück:" */
const HEADER_WITH_YIELD =
  /^(?:les\s+)?(ingredients?|ingredientes|zutaten|ingredienti|liste des ingredients)\s+(?:pour|for|para|fur|per)\b[^:：]{0,50}[:：]?$/;

const SIGN_OFF = /^(?:bon appetit|enjoy|buen provecho|guten appetit|buon appetito)\b/;
const NUMBERED_SENTENCE = /^\s*\d{1,2}\s*[.)]\s*\p{L}[^\n]{20,}/u;

function detectHeader(line: string): Section | null {
  const n = normalizeText(line)
    .replace(/^(?:[#*_\s➡→⬇↓►▶-]|\p{Extended_Pictographic}|\ufe0f|\u20e3|\u200d)+/gu, '')
    .replace(/(?:[#*_\s➡→⬇↓►▶]|\p{Extended_Pictographic}|\ufe0f|\u200d)+$/gu, '')
    .replace(/\s*[:：]\s*$/, ':');
  for (const [section, re] of HEADERS) if (re.test(n)) return section;
  if (HEADER_WITH_YIELD.test(n)) return 'ingredients';
  return null;
}

function extractOven(text: string): number | null {
  const n = normalizeText(text);
  let m = n.match(/(\d{2,3})\s*°\s*f\b/);
  if (m) return fahrenheitToCelsius(Number(m[1]));
  m =
    n.match(/(\d{2,3})\s*(?:°\s*c?|degres|degrees|grad|gradi|grados)\b/) ??
    n.match(/(\d{2,3})\s*°/);
  if (m) {
    const v = Number(m[1]);
    if (v >= 50 && v <= 300) return v;
  }
  m = n.match(/\b(?:th\.?|thermostat)\s*(\d{1,2}(?:[.,]5)?)\b/);
  if (m) return thermostatToCelsius(Number(m[1]!.replace(',', '.')));
  return null;
}

function looksLikeStep(line: string): boolean {
  return line.length > 70 || (/[.!]$/.test(line.trim()) && line.split(' ').length > 6);
}

function cleanLine(line: string): string {
  return tidySocialLine(
    line
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/**
 * Captions decorate lines with emoji: "1️⃣ Fais cuire…" is a numbered step, "🍗 2 escalopes" or
 * "👉 Ajoute…" a bullet. Turned into the plain forms the parser knows ("1. ", "- ").
 */
function tidySocialLine(line: string): string {
  const keycap = /^(\d{1,2})\s*\ufe0f?\u20e3\s*/u.exec(line);
  if (keycap) return `${keycap[1]}. ${line.slice(keycap[0].length)}`;
  if (/^🔟/u.test(line)) return `10. ${line.replace(/^🔟\s*/u, '')}`;
  const deco =
    /^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\p{Emoji_Modifier}|[➡→►▶▸➜➤⇒])+\s*/u.exec(line);
  if (deco && deco[0].length < line.length) return `- ${line.slice(deco[0].length)}`;
  return line;
}

/**
 * Deterministic parser for pasted / shared / OCR'd recipe text. Never invents data: anything it
 * cannot classify goes to `unparsed` so the editor can show it.
 */
/**
 * An ingredient line outside an ingredients section. A quantity written as a word ("Une quiche
 * dorée…") is too ambiguous; a bulleted line next to other ingredients is one even without a
 * quantity ("* sel, poivre").
 */
function looksLikeIngredient(
  l: string,
  ing: ReturnType<typeof parseIngredientLine>,
  prevIngredient: boolean,
): boolean {
  const bullet = /^\s*[-–—•*·▪◦●✓✔]\s*\S/.test(l);
  return (
    ing !== null &&
    l.length <= 80 &&
    !looksLikeStep(l) &&
    (bullet
      ? ing.quantity !== null || prevIngredient
      : ing.quantity !== null && /^\s*[\d½¼¾⅓⅔⅛]/.test(l))
  );
}

export function parseRecipeText(input: string): RecipeDraft {
  const draft = emptyDraft();
  const text = input.replace(/\r\n?/g, '\n').slice(0, 20000);

  // Hashtags → tags (TikTok / Instagram captions), removed from the text.
  const tags = new Set<string>();
  const withoutTags = text.replace(
    /(^|\s)#([\p{L}\p{N}_]{2,40})/gu,
    (_, pre: string, tag: string) => {
      tags.add(tag.toLowerCase());
      return pre;
    },
  );
  draft.tags = [...tags].slice(0, 20);

  const lines = withoutTags.split('\n').map(cleanLine);
  let section: Section = 'none';
  let group: string | null = null;
  const tipLines: string[] = [];
  const noteLines: string[] = [];
  const freeLines: string[] = [];
  let sawHeader = false;

  for (const raw of lines) {
    if (!raw) continue;
    const header = detectHeader(raw);
    if (header) {
      // "Ingrédients pour 2 personnes :" also gives the servings.
      if (draft.servings === null)
        for (const re of SERVINGS_RES) {
          const m = normalizeText(raw).match(re);
          const n = m ? Number(m[1]) : NaN;
          if (n >= 1 && n <= 100) {
            draft.servings = n;
            break;
          }
        }
      section = header;
      group = null;
      sawHeader = true;
      continue;
    }
    const norm = normalizeText(raw);

    // Metadata lines (servings / times / oven) are recognised anywhere.
    let consumed = false;
    if (draft.servings === null) {
      for (const re of SERVINGS_RES) {
        const m = norm.match(re);
        if (m && raw.length < 80) {
          const n = Number(m[1]);
          if (n >= 1 && n <= 100) {
            draft.servings = n;
            consumed = raw.length < 40 || section === 'none';
            break;
          }
        }
      }
    }
    for (const [key, re] of TIME_LABELS) {
      if (draft[key] !== null) continue;
      const lm = norm.match(re);
      if (lm && raw.length < 80) {
        const after = norm.slice(lm.index! + lm[0].length);
        const mins = parseDurationText(after);
        if (mins !== null) {
          draft[key] = mins;
          consumed = true;
        }
      }
    }
    // Multiple labels on one line ("Prép : 15 min | Cuisson : 20 min") are handled above one by one.
    if (draft.ovenTemperatureC === null) {
      const o = extractOven(raw);
      if (o !== null) {
        draft.ovenTemperatureC = o;
        // "Four : 180 °C" is information; "Enfourne 25 min à 180 °C." is a step.
        if (
          raw.length < 60 &&
          /^\W*(four|oven|horno|ofen|backofen|forno|thermostat|th\.?|temperature|cuisson)\b/.test(
            norm,
          )
        )
          consumed = true;
      }
    }
    if (consumed && section !== 'steps') continue;

    if (section === 'ingredients' && SIGN_OFF.test(normalizeText(raw))) continue;
    // Numbered sentences after the ingredients are the method, even without a header; so is a
    // sentence that is not an ingredient ("Fais cuire les pennes 10 min. Pendant ce temps…").
    if (section === 'ingredients' && NUMBERED_SENTENCE.test(raw)) section = 'steps';
    if (
      section === 'ingredients' &&
      draft.ingredients.length > 0 &&
      looksLikeStep(raw) &&
      !/^\s*[-–—•*·▪◦●✓✔]?\s*[\d½¼¾⅓⅔⅛]/.test(raw)
    )
      section = 'steps';
    if (section === 'ingredients') {
      const g = raw.match(GROUP_RE);
      if (g && !/\d/.test(raw) && raw.length < 60 && /[:：]$/.test(raw.trim()) === true) {
        group = cleanLine(raw.replace(/[:：]\s*$/, ''));
        continue;
      }
      if (/[:：]$/.test(raw) && raw.length < 50 && !/\d/.test(raw)) {
        group = raw.replace(/[:：]$/, '').trim();
        continue;
      }
      const ing = parseIngredientLine(raw);
      if (ing) draft.ingredients.push({ group, ...ing });
      continue;
    }
    if (section === 'steps') {
      if (/[:：]$/.test(raw) && raw.length < 50 && !STEP_PREFIX.test(raw)) {
        group = raw.replace(/[:：]$/, '').trim();
        continue;
      }
      const stepText = raw.replace(STEP_PREFIX, '').trim();
      if (!stepText) continue;
      const prev = draft.steps[draft.steps.length - 1];
      // A line without numbering that continues a sentence is merged into the previous step.
      if (
        prev &&
        !STEP_PREFIX.test(raw) &&
        /^\p{Ll}/u.test(stepText) &&
        !/[.!?]$/.test(prev.text)
      ) {
        prev.text = `${prev.text} ${stepText}`;
        prev.timerSeconds ??= parseTimerSeconds(stepText);
        continue;
      }
      draft.steps.push({
        group,
        text: stepText,
        timerSeconds: parseTimerSeconds(stepText),
        timerLabel: null,
      });
      continue;
    }
    if (section === 'tips') {
      tipLines.push(raw.replace(/^[-–•*·]\s*/, ''));
      continue;
    }
    if (section === 'notes') {
      noteLines.push(raw.replace(/^[-–•*·]\s*/, ''));
      continue;
    }
    freeLines.push(raw);
  }

  // Title: first short free line (before any section) that is not an ingredient.
  const titleIdx = freeLines.findIndex(
    (l) =>
      l.length >= 2 &&
      l.length <= 120 &&
      !/^https?:\/\//i.test(l) &&
      !parseIngredientLine(l)?.quantity,
  );
  if (titleIdx >= 0) {
    draft.title =
      freeLines[titleIdx]!.replace(
        /^[-–•#*\s\p{Extended_Pictographic}️]+|[*\s\p{Extended_Pictographic}️]+$/gu,
        '',
      ).trim() || null;
    freeLines.splice(titleIdx, 1);
  }

  if (!sawHeader) {
    // No headers at all: classify free lines heuristically.
    const rest: string[] = [];
    let prevIngredient = false;
    for (const l of freeLines) {
      const ing = parseIngredientLine(l);
      const isIngredient = looksLikeIngredient(l, ing, prevIngredient);
      prevIngredient = isIngredient;
      if (
        STEP_PREFIX.test(l) &&
        /^\s*(?:\d{1,2}\s*[.)]|etape|step|paso|schritt|passo)/i.test(normalizeText(l))
      ) {
        const t = l.replace(STEP_PREFIX, '').trim();
        if (t)
          draft.steps.push({
            group: null,
            text: t,
            timerSeconds: parseTimerSeconds(t),
            timerLabel: null,
          });
      } else if (isIngredient) {
        draft.ingredients.push({ group: null, ...ing! });
      } else if (
        draft.ingredients.length > 0 &&
        (looksLikeStep(l) || l.split(/\s+/).length >= 3) &&
        !SIGN_OFF.test(normalizeText(l))
      ) {
        // After the ingredients, a sentence is the method (captions rarely title it).
        draft.steps.push({
          group: null,
          text: l,
          timerSeconds: parseTimerSeconds(l),
          timerLabel: null,
        });
      } else {
        rest.push(l);
      }
    }
    freeLines.length = 0;
    freeLines.push(...rest);
  } else if (!draft.ingredients.length) {
    // A method header but no ingredients header ("Crêpes / - 250 g de farine / … / Préparation :",
    // common in captions): the ingredient lines written before it are the ingredients.
    const rest: string[] = [];
    let prevIngredient = false;
    for (const l of freeLines) {
      const ing = parseIngredientLine(l);
      prevIngredient = looksLikeIngredient(l, ing, prevIngredient);
      if (prevIngredient) draft.ingredients.push({ group: null, ...ing! });
      else rest.push(l);
    }
    freeLines.length = 0;
    freeLines.push(...rest);
  }

  // Remaining free text before the sections is the description; anything else is kept as unparsed.
  if (freeLines.length) {
    const desc = freeLines.filter((l) => !/^https?:\/\//i.test(l));
    if (desc.length && desc.join(' ').length <= 600) draft.description = desc.join('\n');
    else draft.unparsed = freeLines;
    const url = freeLines.find((l) => /^https?:\/\/\S+$/i.test(l));
    if (url) draft.sourceUrl = url;
  }
  draft.steps = splitProse(draft.steps);
  if (tipLines.length) draft.tips = tipLines.join('\n');
  if (noteLines.length) draft.notes = noteLines.join('\n');
  return draft;
}

/**
 * A method written as one paragraph becomes one step per sentence or two (short sentences are
 * kept with the next one): "Fais cuire les pennes 10 min. Pendant ce temps, coupe le poulet…".
 */
function splitProse(steps: RecipeDraft['steps']): RecipeDraft['steps'] {
  const out: RecipeDraft['steps'] = [];
  for (const st of steps) {
    const sentences =
      st.text.length > 160 ? st.text.split(/(?<=[.!?])\s+(?=\p{Lu})/u).map((x) => x.trim()) : [];
    if (sentences.length < 2) {
      out.push(st);
      continue;
    }
    const first = out.length;
    let cur = '';
    for (const sentence of sentences) {
      cur = cur ? `${cur} ${sentence}` : sentence;
      if (cur.length >= 40) {
        out.push({ ...st, text: cur, timerSeconds: parseTimerSeconds(cur) });
        cur = '';
      }
    }
    if (cur) {
      // A short last sentence ("Sers aussitôt.") stays with the step before it.
      const last = out.length > first ? out[out.length - 1]! : null;
      if (last) {
        last.text = `${last.text} ${cur}`;
        last.timerSeconds ??= parseTimerSeconds(cur);
      } else out.push({ ...st, text: cur, timerSeconds: parseTimerSeconds(cur) });
    }
  }
  return out;
}
