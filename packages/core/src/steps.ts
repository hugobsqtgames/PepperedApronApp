import { parseTimerSeconds } from './duration';
import { ingredientKey, normalizeText, singularize } from './text';

/**
 * Timer for a step that has none: "cuire 8 min", "1 h 30 de repos". Shown as a button only, the
 * recipe is not changed. Below 10 s or above a day it is not a cooking time.
 */
export function detectStepTimer(step: {
  text: string;
  timerSeconds: number | null;
}): number | null {
  if (step.timerSeconds) return step.timerSeconds;
  const s = parseTimerSeconds(step.text);
  return s !== null && s >= 10 && s <= 86_400 ? s : null;
}

const FILLER = new Set([
  'de',
  'du',
  'des',
  'd',
  'la',
  'le',
  'les',
  'l',
  'a',
  'au',
  'aux',
  'en',
  'et',
  'of',
  'the',
  'and',
  'with',
  'avec',
  'pour',
  'for',
  'un',
  'une',
  'some',
]);

/** Words of a text as matched against ingredient names (lowercase, no accents, singular). */
const words = (s: string) =>
  normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularize);

/**
 * Ingredients a step talks about ("Faire revenir les oignons et l'ail" → oignons, ail), in the
 * ingredient list's order. A name matches when all its words are in the step, or its main word
 * (first word in French "crème fraîche", last in English "olive oil") of 3 letters or more.
 */
export function stepIngredients<T extends { name: string }>(text: string, ingredients: T[]): T[] {
  const inStep = new Set(words(text));
  return ingredients.filter((ing) => {
    const key = ingredientKey(ing.name)
      .split(' ')
      .filter((w) => w && !FILLER.has(w));
    if (!key.length) return false;
    if (key.every((w) => inStep.has(w))) return true;
    const first = key[0]!;
    const last = key[key.length - 1]!;
    return (first.length >= 3 && inStep.has(first)) || (last.length >= 3 && inStep.has(last));
  });
}

export type VoiceCommand = 'next' | 'previous' | 'repeat' | 'timer' | 'ingredients' | 'stop';

const COMMANDS: [VoiceCommand, RegExp][] = [
  ['previous', /\b(precedente?|retour|reviens|previous|go back|back)\b/],
  ['next', /\b(suivante?|apres|next|continue|continuer)\b/],
  ['repeat', /\b(repete|repeter|relis|redis|repeat|again|read it)\b/],
  ['timer', /\b(minuteur|chrono|timer|lance|demarre|start)\b/],
  ['ingredients', /\b(ingredients?)\b/],
  ['stop', /\b(stop|arrete|tais toi|silence|quiet)\b/],
];

/**
 * What was said in cook mode → a command ("suivant", "étape précédente", "répète", "lance le
 * minuteur", "ingrédients"), or null. Only the last few words count: recognition keeps the
 * whole sentence, and the command is what was just said.
 */
export function voiceCommand(said: string): VoiceCommand | null {
  const tail = normalizeText(said)
    .replace(/[^a-z' ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(-4);
  const s = tail.join(' ');
  for (const [cmd, re] of COMMANDS) if (re.test(s)) return cmd;
  return null;
}
