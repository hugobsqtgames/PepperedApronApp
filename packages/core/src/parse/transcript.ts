import { parseTimerSeconds } from '../duration';
import { foodSpans } from '../shopping';
import { ingredientKey, normalizeText, singularize } from '../text';
import type { DraftIngredient, DraftStep } from './draft';
import { parseIngredientLine } from './ingredient';
import { isHookSentence } from './title';

/**
 * Recipes explained only out loud: reads the video's automatic subtitles (published by TikTok or
 * YouTube) with fixed rules — no AI. Ingredients are the foods mentioned (with a quantity when
 * one is said just before), steps are the sentences describing a cooking action. The whole
 * transcript is kept so the user can complete the recipe.
 */

/** Plain text of a WebVTT file: cue text only, tags removed, rolling duplicates merged. */
export function vttToLines(vtt: string): string[] {
  const out: string[] = [];
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0] ?? '')) continue;
    for (const l of lines) {
      if (!l.trim() || l.includes('-->') || /^\d+$/.test(l.trim())) continue;
      const text = l
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\[[^\]]*\]/g, '')
        .trim();
      if (!text) continue;
      // Auto captions repeat the previous line while the next one is typed.
      const prev = out[out.length - 1];
      if (prev === text) continue;
      if (prev && text.startsWith(prev)) out[out.length - 1] = text;
      else if (prev && prev.endsWith(text)) continue;
      else out.push(text);
    }
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  douze: 12,
  quinze: 15,
  vingt: 20,
  trente: 30,
  cinquante: 50,
  cent: 100,
  demi: 0.5,
  demie: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  half: 0.5,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  medio: 0.5,
  media: 0.5,
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  funf: 5,
  halbe: 0.5,
  halben: 0.5,
  due: 2,
  tre: 3,
  quattro: 4,
  mezzo: 0.5,
  mezza: 0.5,
};
// Words that are foods only after certain words ("du maïs" vs "mais" = but).
const AMBIGUOUS: Record<string, string[]> = {
  mais: ['du', 'de', 'grain', 'grains', 'epi', 'epis'],
  glace: ['de', 'une', 'boule', 'boules', 'la'],
  glaces: ['de', 'boules'],
  sel: ['du', 'de', 'le', 'fleur', 'pincee', 'gros'],
  orange: ['une', 'des', 'd', 'de', 'l', 'jus', 'zeste', 'an'],
  cote: ['une', 'des', 'deux', 'trois'],
  roti: ['un', 'le', 'du'],
};
// "un pesto", "une poêle" (often written "1" by speech recognition): articles, a quantity only before a measure.
const ONE = new Set(['1', 'un', 'une', 'one', 'uno', 'una', 'ein', 'eine', 'einen']);
// Small words allowed between a quantity and the food ("2 cuillères à soupe DE sucre").
const LINKS = new Set(
  'de d du des la le l les of the di del della dei degli von vom der die das en a al'.split(' '),
);

const COOKING_VERBS = [
  // fr
  'ajout',
  'rajout',
  'mélang',
  'melang',
  'cuire',
  'cuis',
  'cuit',
  'caramelis',
  'vers',
  'coup',
  'emin',
  'hach',
  'revenir',
  'enfourn',
  'prechauff',
  'mix',
  'fouett',
  'incorpor',
  'egoutt',
  'laiss',
  'mets',
  'mettez',
  'mettre',
  'saupoudr',
  'assaisonn',
  'poivr',
  'deglac',
  'dore',
  'dorer',
  'fri',
  'bouill',
  'mijot',
  'rotir',
  'epluch',
  'rap',
  'faites',
  'fais',
  'plong',
  'servez',
  'sers',
  'dress',
  'reserv',
  'retir',
  'chauff',
  'remu',
  'termin',
  'recouvr',
  'garn',
  'arros',
  'former',
  'formez',
  'etal',
  'dispos',
  'badigeonn',
  'peler',
  'pelez',
  'decoup',
  'tranch',
  'concass',
  'ecras',
  'filtr',
  'tamis',
  'petri',
  'abaiss',
  'farc',
  'napp',
  'flamb',
  'poeler',
  'poelez',
  'grill',
  'blanch',
  'ecum',
  'redui',
  'emuls',
  'refroid',
  'congel',
  'chemis',
  'demoul',
  'tremp',
  'rinc',
  'egren',
  'parsem',
  'creus',
  'reposer',
  'reposez',
  'couvr',
  'depos',
  'placer',
  'placez',
  'prenez',
  'prends',
  'prendre',
  'repart',
  'rempli',
  'etir',
  'tartin',
  'enrob',
  'paner',
  'panez',
  'cisel',
  'detaill',
  'battre',
  'battez',
  'fondre',
  'faire fondre',
  'dissou',
  'dilu',
  'tiedi',
  'gratiner',
  'gratinez',
  'tourn',
  'retourn',
  'lisser',
  'lissez',
  'monter',
  'montez',
  'colorer',
  'saisi',
  'saisir',
  'assembl',
  'decor',
  'fourr',
  'glisser',
  'glissez',
  'enrouler',
  'plier',
  'pliez',
  'casser',
  'cassez',
  'separer',
  'separez',
  'ecal',
  'presser',
  // en
  'mash',
  'fold',
  'squeeze',
  'drizzle',
  'knead',
  'roll',
  'shape',
  'transfer',
  'cover',
  'chill',
  'refrigerate',
  'freeze',
  'marinate',
  'brush',
  'grease',
  'peel',
  'dice',
  'mince',
  'crush',
  'cut',
  'beat',
  'sift',
  'garnish',
  'flip',
  'sear',
  'saute',
  'grill',
  'broil',
  'steam',
  'poach',
  'reduce',
  'strain',
  'rinse',
  'soak',
  'whip',
  'arrange',
  'remove',
  'bring',
  'scoop',
  'stuff',
  'wrap',
  'fill',
  'divide',
  'blitz',
  'puree',
  'caramelize',
  'deglaze',
  'thicken',
  'microwave',
  'crack',
  'pound',
  'flatten',
  'shred',
  'bake',
  'assemble',
  'spoon',
  'massage',
  'add',
  'mix',
  'stir',
  'cook',
  'bake',
  'boil',
  'chop',
  'slice',
  'whisk',
  'fry',
  'season',
  'simmer',
  'heat',
  'preheat',
  'combine',
  'serve',
  'melt',
  'drain',
  'blend',
  'roast',
  'grate',
  'sprinkle',
  'toss',
  'spread',
  'put',
  // es
  'anad',
  'mezcl',
  'cocin',
  'hornea',
  'cort',
  'vierte',
  'batir',
  'bate',
  'freir',
  'fri',
  'sazon',
  'calient',
  'herv',
  'remuev',
  // de
  'hinzu',
  'misch',
  'ruhr',
  'koch',
  'schneid',
  'brat',
  'wurz',
  'erhitz',
  'schmelz',
  // it
  'aggiung',
  'mescol',
  'cuoc',
  'cuoci',
  'inforn',
  'tagli',
  'versa',
  'sbatt',
  'friggi',
  'condi',
  'scald',
  'soffrigg',
];

interface Word {
  raw: string;
  /** Normalized ("œufs" → "oeufs"). */
  plain: string;
  /** Normalized and singular, as in the food dictionary. */
  norm: string;
}

function words(sentence: string): Word[] {
  return (sentence.match(/[\p{L}\p{N}]+(?:[.,]\d+)?/gu) ?? []).map((raw) => {
    const plain = normalizeText(raw).replace(/[^a-z0-9.,]/g, '');
    return { raw, plain, norm: singularize(plain) };
  });
}

/**
 * Words that start a new step when a recipe is said out loud ("ensuite", "une fois que…"): the
 * phone's speech recognition puts few full stops, and a whole video came out as one step.
 */
const SPOKEN_BREAKS = new RegExp(
  '\\s(?=(?:' +
    [
      'ensuite',
      'puis',
      'apr[eè]s (?:[cç]a|cela|avoir)',
      'et en attendant',
      'en attendant',
      'pendant ce temps',
      'pendant que',
      'une fois que',
      'une fois (?:cuit|cuite|cuits|cuites|fondu|pr[eê]t)',
      'maintenant',
      'enfin',
      'pour finir',
      'pour terminer',
      'pour la suite',
      '[aà] la sortie',
      'et voil[aà]',
      '(?:donc |alors )?(?:je vais|on va) commencer par',
      'pour commencer',
      'then',
      'next',
      'after that',
      'meanwhile',
      'once',
      'finally',
    ].join('|') +
    ')\\b)',
  'giu',
);
/** Longer than this, a sentence said out loud is cut where a new action starts. */
const LONG_SPOKEN = 140;

/** A long spoken passage cut where a new action starts; short pieces stay with the one before. */
function splitSpoken(sentence: string): string[] {
  if (sentence.length <= LONG_SPOKEN) return [sentence];
  const pieces = sentence
    .split(SPOKEN_BREAKS)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const piece of pieces) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (prev.length < 30 || piece.length < 25))
      out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  // Still very long (no marker said): cut at ", je…", ", j'…", ", on…".
  // A piece ending on a linking word ("…tout est prêt donc"): the word goes.
  for (let i = 0; i < out.length; i++)
    out[i] = out[i]!.replace(/[\s,]+(?:donc|et|alors|and|so)$/iu, '');
  return out.flatMap((x) =>
    x.length > 260 ? x.split(/,\s+(?=(?:je|j'|j’|on|tu|vous)\s?)/iu).map((y) => y.trim()) : [x],
  );
}

function sentences(lines: string[]): string[] {
  const joined = lines
    .join(' ')
    .replace(/\s+/g, ' ')
    // "2 00 °" heard for "200 °".
    .replace(/\b(\d) (\d{2})\s?°/g, '$1$2 °')
    // "j' ajoute", "l' eau": the phone's recognition spaces the apostrophe.
    .replace(/\b(qu|[ljdnmtsc])(['’]) (?=\p{L})/giu, '$1$2')
    .trim();
  const punctuated = (joined.match(/[.!?]/g)?.length ?? 0) * 200 >= joined.length;
  // Auto captions without punctuation: each caption line is the best unit we have — unless the
  // whole video came as one or two lines (the phone's own recognition): then the full stops it
  // did put are used.
  const parts =
    punctuated || lines.length <= 2 || lines.some((l) => l.length > 400)
      ? joined.split(/(?<=[.!?…])\s+/)
      : lines;
  return parts
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap(splitSpoken)
    .filter(Boolean);
}

/**
 * Whether a step from a caption describes something to do: "Essaye de pas le faire cramer…" or
 * "BON AP LES AMIS" under the ingredients are comments, not the method.
 */
export function hasCookingSteps(steps: { text: string }[]): boolean {
  return steps.some((st) => isCookingSentence(st.text));
}

/**
 * Caption steps that are only comments are replaced by the steps said in the video; the
 * comments stay in the notes. Returns whether they were replaced.
 */
export function takeSpokenSteps(
  draft: { steps: DraftStep[]; notes: string | null },
  spoken: DraftStep[],
): boolean {
  if (!spoken.length || hasCookingSteps(draft.steps)) return false;
  const comments = draft.steps.map((st) => st.text).join('\n');
  draft.steps = spoken;
  if (comments) draft.notes = [comments, draft.notes].filter(Boolean).join('\n\n').slice(0, 5000);
  return true;
}

/** Verbs only trusted when they open a clause ("pour the sauce", "saler"): nouns elsewhere. */
const CLAUSE_VERBS = new Set(
  (
    'uncover,layer,repeat,place,smash,stack,toast,pour,brown,dip,coat,press,let,top,form,make,' +
    'saler,salez,poivrer,nacrer,beurrer,beurrez,fariner,farinez,zester,rouler,roulez,pocher,' +
    'huiler,huilez,sucrer,garnir,griller,refermer,refermez,servir,arroser,faire,fais,faites,laisse,' +
    'couvre,couvrir,etaler,etale,etalez,poser,pose,posez,ferme,fermer,fermez,ouvrir,ouvre,ouvrez,' +
    'bats,bat,battre,battez,salez,poivrez,pique,piquer,piquez,roule,coupe,cuis,mets,mettez'
  ).split(','),
);
/** Small words that can come before the verb of an instruction: "puis LES égoutter". */
const CLAUSE_LEAD = new Set(
  'puis,ensuite,et,enfin,apres,then,and,finally,next,now,les,la,le,l,en,y,lui,leur,it,them,bien,delicatement,doucement,gently,carefully,immediatement,aussitot,rapidement,quickly,on,va,vas,vais,faut,il,peut,doit,fait,you,we'.split(
    ',',
  ),
);

/**
 * Whether a clause starts with an instruction verb: "ajouter l'eau", "les verser dans la poêle",
 * "then stir in the sauce". `strict`: only the verb itself may come first (after "et" / "and").
 */
export function startsWithAction(clause: string, strict = false, byEnding = true): boolean {
  const ws = words(clause);
  let i = 0;
  const maxLead = strict ? 2 : 3;
  while (i < ws.length && i < maxLead && CLAUSE_LEAD.has(ws[i]!.plain)) i++;
  const w = ws[i]?.plain;
  if (!w || NOT_VERB.has(w)) return false;
  // After "le", "la", "les": an infinitive ("les verser", "le faire dorer"), never "le mélange".
  // ("on le mélange": a pronoun, the verb conjugated.)
  const afterArticle =
    i > 0 &&
    /^(les|la|le|l)$/.test(ws[i - 1]!.plain) &&
    !/^(on|je|tu|il|elle|nous|vous)$/.test(ws[i - 2]?.plain ?? '');
  if (afterArticle && !/(?:er|ir|re)$/.test(w) && w !== 'faire') return false;
  if (CLAUSE_VERBS.has(w) || (byEnding && frenchVerbForm(w))) return true;
  // A verb's own endings only: "bouillir" is one, "bouillon" a food.
  return COOKING_VERBS.some((v) => w.startsWith(v) && VERB_ENDING.test(w.slice(v.length)));
}
const VERB_ENDING = /^(?:|e|es|ez|er|ir|re|is|it|s|ons|ent|issez|isse|ing)$/;

/** Not verbs though they end like one: "assez", "premier", "papier sulfurisé". */
const NOT_VERB = new Set(
  'abonnez,abonner,partagez,partager,likez,liker,commentez,commenter,suivez,regardez,regarder,essayez,testez,tester,enregistrez,enregistrer,cliquez,allez,venez,rejoignez,assez,chez,premier,premiere,dernier,derniere,entier,entiere,leger,legere,papier,panier,cuiller,cahier,super,hier,fer,mer,cher,clair,plaisir,desir,avenir,loisir,saphir,soir,noir,miroir,tiroir,beurre,poivre,sucre,cidre,cendre,ordre,feutre,litre,tendre,autre,entre,contre,notre,votre,quatre,chiffre,cuivre,sabre,arbre,chambre,nombre,membre,octobre,novembre,decembre,septembre,timbre,vinaigre,gingembre,coriandre,muscadier,grenier,plier,dessert,boucher,boulanger,patissier,cuisinier,epicier,fermier,laitier,pommier,poirier,cerisier,olivier,rosier,figuier,dolmen,amer,hiver,ether,cancer,poker,laser,leader,burger,mixer,sticker,timer,starter,shaker,blender,poster,toaster,dinner,butter,water,sugar,flour,pepper,ginger,later,after,over,under,other,either,together,rather,never,ever,whether,better,center,corner,paper'.split(
    ',',
  ),
);
/** "lavez", "prélever", "pétrir": a French imperative or infinitive by its ending. */
function frenchVerbForm(w: string): boolean {
  // "saladier", "tablier": things; "plier", "vérifier": the few verbs so written.
  if (/ier$/.test(w) && !/^(plier|lier|delier|verifier|trier|deplier|replier)$/.test(w))
    return false;
  return w.length >= 5 && /(?:ez|er|ir)$/.test(w) && !NOT_VERB.has(w);
}

/** Whether a text contains an instruction verb somewhere (used to keep "Quand le beurre est fondu," whole). */
export function hasActionWord(text: string): boolean {
  return words(text).some(
    (w) =>
      CLAUSE_VERBS.has(w.plain) ||
      frenchVerbForm(w.plain) ||
      COOKING_VERBS.some(
        (v) => w.plain.startsWith(v) && w.plain.length - v.length <= (v.length <= 4 ? 2 : 4),
      ),
  );
}

function isCookingSentence(s: string): boolean {
  const ws = words(s);
  // Questions and fragments ("Et je vais ajouter") are not instructions.
  if (ws.length < 3 || /\?\s*$/.test(s)) return false;
  // Starts with the instruction: "Le faire dorer.", "Pour into a loaf tin."
  if (startsWithAction(s, false, false)) return true;
  const last = ws[ws.length - 1]!.plain;
  // A fragment ending on the verb ("Et je vais ajouter"): not one; a long sentence that ends so
  // ("…les morceaux de tomate à cuire") is.
  if (ws.length < 8 && /(er|ir|re)$/.test(last) && COOKING_VERBS.some((v) => last.startsWith(v)))
    return false;
  // A verb stem plus a short conjugation ending ("ajout" → "ajoute", "ajoutez", "ajouté").
  return COOKING_VERBS.some((v) =>
    ws.some((w) => w.plain.startsWith(v) && w.plain.length - v.length <= (v.length <= 4 ? 2 : 4)),
  );
}

export interface TranscriptRecipe {
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  /** The transcript, one sentence per line (kept in the recipe notes). */
  text: string;
}

export function recipeFromTranscript(lines: string[]): TranscriptRecipe {
  const all = sentences(lines);
  const ingredients: DraftIngredient[] = [];
  // Index of each food already found: a later mention may bring the quantity the first lacked
  // ("pour ce poulet au curry il faut 500 grammes de poulet").
  const seen = new Map<string, number>();
  for (const s of all) {
    const ws = words(s);
    for (const { start, end } of foodSpans(ws.map((w) => w.norm))) {
      const before = ws[start - 1]?.plain ?? '';
      // "cuillère à soupe" is a measure, "mais" is mostly "but": only foods when clearly used so.
      if (before === 'a' && /^cuill/.test(ws[start - 2]?.plain ?? '')) continue;
      const allowed = AMBIGUOUS[ws[start]!.plain];
      if (allowed && end - start === 1 && !allowed.includes(before)) continue;
      const name = ws
        .slice(start, end)
        .map((w) => w.raw)
        .join(' ');
      const key = ingredientKey(name);
      const before_ = seen.get(key);
      if (before_ !== undefined && ingredients[before_]!.quantity !== null) continue;
      // Look back for a spoken quantity: "200 grammes de", "deux cuillères à soupe de".
      let k = start - 1;
      while (k >= 0 && LINKS.has(ws[k]!.norm)) k--;
      let q = -1;
      for (let back = k; back >= Math.max(0, k - 3); back--) {
        const w = ws[back]!.plain;
        if (/^\d+([.,]\d+)?$/.test(w) || w in NUMBER_WORDS) {
          q = back;
          break;
        }
      }
      let ing = null;
      if (q >= 0) {
        const phrase = [
          ...ws
            .slice(q, start)
            .map((w, i) =>
              i === 0 && w.plain in NUMBER_WORDS ? String(NUMBER_WORDS[w.plain]) : w.raw,
            ),
          name,
        ].join(' ');
        const parsed = parseIngredientLine(phrase);
        // Only a quantity that applies to this food ("1 poêle avec du beurre" is not 1 butter).
        if (
          parsed &&
          parsed.quantity !== null &&
          ingredientKey(parsed.name) === key &&
          !(ONE.has(ws[q]!.plain) && parsed.unit === null)
        )
          ing = parsed;
      }
      if (before_ !== undefined) {
        if (ing)
          Object.assign(ingredients[before_]!, {
            quantity: ing.quantity,
            quantityMax: ing.quantityMax,
            unit: ing.unit,
          });
        continue;
      }
      seen.set(key, ingredients.length);
      ingredients.push({
        group: null,
        name: ing?.name || name,
        quantity: ing?.quantity ?? null,
        quantityMax: ing?.quantityMax ?? null,
        unit: ing?.unit ?? null,
        note: null,
      });
    }
  }
  // "Je vais vous montrer comment faire…", "Faites ça ce soir et…": hooks, never steps.
  const steps = all
    .filter((x) => isCookingSentence(x) && !isHookSentence(x))
    .map((text) => ({
      group: null,
      text: text.charAt(0).toUpperCase() + text.slice(1),
      timerSeconds: parseTimerSeconds(text),
      timerLabel: null,
    }));
  return { ingredients: ingredients.slice(0, 60), steps: steps.slice(0, 40), text: all.join('\n') };
}

/** Whether a sentence is an instruction to cook ("Faites revenir l'oignon"), not a comment. */
export const isCookingStep = (sentence: string) => isCookingSentence(sentence);

/** Numbers said out loud ("deux", "cent", "demi"), for checking a quantity against a video. */
export const SPOKEN_NUMBERS: Readonly<Record<string, number>> = NUMBER_WORDS;
