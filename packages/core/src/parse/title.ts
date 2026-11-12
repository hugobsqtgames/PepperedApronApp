import { normalizeText } from '../text';

/**
 * The name of the dish, from what creators write and say around it: the caption's hook ("avec
 * ces pennes au poulet je te jure tu vas te régaler" → "Pennes au poulet"), the title written on
 * the video, or the first words said. No AI: a list of dish words, extended with what follows
 * them ("au poulet", "crémeuses au citron") until a word that starts the rest of the sentence.
 */

/** Words that name a dish (singular, normalised). */
const DISH_HEADS = new Set(
  (
    'pate,pates,penne,pennes,spaghetti,spaghettis,tagliatelle,tagliatelles,linguine,fusilli,macaroni,coquillettes,lasagne,lasagnes,gnocchi,gnocchis,ravioli,raviolis,risotto,riz,nouilles,ramen,udon,pad,wok,' +
    'poulet,boeuf,porc,veau,agneau,dinde,canard,saumon,cabillaud,thon,crevettes,moules,oeufs,omelette,frittata,' +
    'gratin,tarte,tartelette,tartelettes,quiche,gateau,gateaux,cake,cookie,cookies,brownie,brownies,muffin,muffins,madeleines,crepe,crepes,pancake,pancakes,gaufre,gaufres,' +
    'soupe,veloute,potage,salade,bowl,poke,curry,dahl,dal,chili,burger,burgers,wrap,wraps,tacos,taco,burrito,quesadilla,fajitas,pizza,pizzas,croque,croques,sandwich,panini,bagel,' +
    'tiramisu,mousse,flan,cheesecake,crumble,clafoutis,galette,galettes,focaccia,pain,brioche,banana,financiers,cannelés,canneles,fondant,moelleux,charlotte,panna,riz-au-lait,' +
    'hachis,parmentier,blanquette,bourguignon,tajine,couscous,paella,risotto,granola,smoothie,porridge,frites,nuggets,boulettes,falafel,falafels,houmous,hummus,' +
    'sauce,pesto,carbonara,bolognaise,lasagna,mac,enchiladas,shakshuka,nems,rouleaux,sushi,sushis,maki,gyoza,gyozas,dumplings,bao,' +
    'pasta,noodles,chicken,beef,pork,salmon,shrimp,eggs,pie,tart,cookies,cupcakes,bread,soup,salad,stew,casserole,toast,rolls,bites,traybake,bake'
  ).split(','),
);

/** Words that start the rest of the sentence: the dish name stops before them. */
const STOP = new Set(
  (
    'je,j,tu,te,t,toi,vous,on,il,elle,ils,nous,qui,que,qu,c,ca,cela,ce,est,sont,etait,vas,va,allez,vais,fait,fais,faites,trop,hyper,super,tres,vraiment,' +
    'comme,quand,pour,avec,mais,ou,donc,car,si,alors,aujourd,ici,voici,voila,meilleur,meilleure,meilleurs,monde,vie,jamais,toujours,recette,recettes,' +
    'votre,vos,ta,tes,ton,ma,mes,mon,notre,nos,leur,leurs,' +
    'your,my,our,their,of all,' +
    'i,you,we,they,he,she,it,is,are,was,will,this,that,so,really,very,best,ever,recipe,recipes,for,but,when,if,here,today,made,make,try,let'
  ).split(','),
);
/** Small words that can be inside a dish name: "pâtes AU poulet", "tarte AUX pommes". */
const LINK = new Set('au,aux,a,la,l,de,du,des,d,en,et,with,and,of,in'.split(','));
const DETERMINERS = new Set(
  'les,des,ces,mes,une,un,la,le,l,du,de,cette,ce,cet,the,a,an,my,these,some,this,that,those'.split(
    ',',
  ),
);
/** Praise, not part of a dish's name: "les VRAIES pâtes carbonara", "the BEST lasagna". */
const PRAISE = new Set(
  'vrai,vraie,vrais,vraies,bon,bonne,bons,bonnes,petit,petite,petits,petites,mini,meilleur,meilleure,super,top,simple,facile,rapide,easy,quick,best,perfect,ultimate,real,simple,favorite,favourite,non,no,oui,yes,ok,et,and,ou,or'.split(
    ',',
  ),
);
/** Dish words that are as often a food of the recipe: never the dish just by being named often. */
const FOOD_HEADS = new Set(
  'poulet,boeuf,porc,veau,agneau,dinde,canard,saumon,cabillaud,thon,crevettes,moules,oeufs,riz,sauce,pain,pesto,chicken,beef,pork,salmon,shrimp,eggs,bread,pate,pates,pasta,noodles,nouilles,frites,mac,pad,wok,toast,rolls,bites,bake,tart,pie,sushi,maki'.split(
    ',',
  ),
);

/** Words, apostrophes and punctuation of a text, without hashtags or mentions (an emoji ends a phrase). */
const words = (s: string): string[] =>
  s
    .replace(/[#@][\p{L}\d_.]+/gu, ' ')
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})+\ufe0f?/gu, ' . ')
    .match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*|['’]|[,;:.!?…()"«»“”]/gu) ?? [];

/** A word's dish head: "croque-monsieur" → "croque". */
const headOf = (norm: string): string | null => {
  if (DISH_HEADS.has(norm)) return norm;
  const first = norm.split('-')[0]!;
  return first !== norm && DISH_HEADS.has(first) ? first : null;
};
const normWords = (ws: string[]) => ws.map((w) => normalizeText(w).replace(/['’]/g, ''));

function sentenceCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

/** The dish phrase starting at word i (a dish word), or null when it is a measure or a pan. */
function phraseAt(ws: string[], norm: string[], i: number): string | null {
  // "cuillère à soupe", "dans une casserole": a measure or a pan, not the dish.
  const before = norm[i - 1] ?? '';
  if (before === 'a' || (i > 1 && norm[i - 2] === 'dans')) return null;
  // A dish word alone after "avec du" is an ingredient ("avec du poulet").
  const out: string[] = [ws[i]!];
  // "smash burgers", "banana bread": one or two words before it, at the start of the phrase.
  const isPunct = (k: number) => k < 0 || /^[,;:.!?…()"«»“”]$/.test(ws[k]!);
  let k = i - 1;
  while (k >= 0 && i - k <= 2 && !isPunct(k)) k--;
  if (isPunct(k) && k < i - 1) {
    const lead = ws.slice(k + 1, i);
    const ok = norm
      .slice(k + 1, i)
      .every(
        (n) =>
          n &&
          !STOP.has(n) &&
          !DETERMINERS.has(n) &&
          !LINK.has(n) &&
          !PRAISE.has(n) &&
          !/^\d/.test(n) &&
          !headOf(n),
      );
    if (ok) out.unshift(...lead);
  }
  let j = i + 1;
  for (; j < ws.length && out.length < 7; j++) {
    const n = norm[j]!;
    if (/^[,;:.!?…()"«»“”]$/.test(ws[j]!)) break;
    // An apostrophe joins "d'" / "l'" to the next word.
    if (!n) {
      out.push(ws[j]!);
      continue;
    }
    if (STOP.has(n) || /^\d/.test(n)) break;
    out.push(ws[j]!);
  }
  // Never ends on a small word or an apostrophe ("pâtes au", "tarte d'").
  const small = (w: string) => /^['’]$/.test(w) || LINK.has(normalizeText(w));
  while (out.length > 1 && small(out[out.length - 1]!)) out.pop();
  // "avec du poulet": a food; "la recette des crêpes", "faire des cookies": the dish.
  if (
    out.length === 1 &&
    i > 0 &&
    /^(du|de|des)$/.test(norm[i - 1]!) &&
    !/^(recette|recettes|recipe|faire|fait|fais|faites|prepare|preparer)$/.test(norm[i - 2] ?? '')
  )
    return null;
  return sentenceCase(out.join(' ').replace(/\s*(['’])\s*/g, '$1'));
}

/**
 * The dish named in a sentence, or null: "Avec ces pennes au poulet je te jure…" → "Pennes au
 * poulet". At most 7 words; it never ends on a small word ("pâtes au").
 */
export function dishPhrase(text: string): string | null {
  const ws = words(text);
  const norm = normWords(ws);
  for (let i = 0; i < ws.length; i++) {
    if (!headOf(norm[i]!)) continue;
    const p = phraseAt(ws, norm, i);
    if (p) return p;
  }
  return null;
}

/**
 * The dish a post is about when it is named again and again ("Petite salade ? Non, pizza 🤤 Cette
 * pizza chèvre miel… 1 pâte à pizza… #pizza"), and the best phrase naming it. A food of the
 * recipe ("poulet", "pain de mie") is never that dish just by being named often.
 */
export function dominantDish(
  text: string,
  ingredients: string[] = [],
): { head: string; count: number; phrase: string | null } | null {
  const counts = new Map<string, number>();
  const tagged = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\d_]{3,40})/gu)) {
    const tag = normalizeText(m[1]!);
    for (const h of DISH_HEADS)
      if (h.length >= 4 && !FOOD_HEADS.has(h) && tag.startsWith(h)) {
        counts.set(h, (counts.get(h) ?? 0) + 1);
        tagged.add(h);
        break;
      }
  }
  const ws = words(text);
  const norm = normWords(ws);
  norm.forEach((n, i) => {
    const h = headOf(n);
    if (!h || FOOD_HEADS.has(h)) return;
    if ((h === 'soupe' || h === 'soup') && norm[i - 1] === 'a') return;
    // "dans un bowl", "into a bowl", "dans une casserole": the dish it is served in.
    if (norm.slice(Math.max(0, i - 3), i).some((w) => /^(dans|in|into)$/.test(w))) return;
    // "on fait une pizza", "la recette des crêpes", "making a lasagna": the dish being made.
    const lead = norm.slice(Math.max(0, i - 3), i).join(' ');
    const made =
      /\b(fait|fais|faire|faisons|prepare|preparer|cuisine|recette|recettes|making|make|makes|recipe|cook|cooking)\b/.test(
        lead,
      );
    counts.set(h, (counts.get(h) ?? 0) + (made ? 3 : 1));
  });
  const foods = ingredients.map((x) => normalizeText(x));
  const ranked = [...counts.entries()]
    // A food of the list ("salade pour servir") only counts when the post is tagged with it.
    .filter(([h]) => tagged.has(h) || !foods.some((f) => f.split(/[\s-]+/).includes(h)))
    .sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return null;
  // Its longest phrase in the text: "Pizza chèvre miel" rather than "Pizza".
  let phrase: string | null = null;
  norm.forEach((n, i) => {
    if (headOf(n) !== top[0]) return;
    const p = phraseAt(ws, norm, i);
    if (p && p.split(' ').length <= 6 && (!phrase || p.length > phrase.length)) phrase = p;
  });
  return { head: top[0], count: top[1], phrase };
}

/** The dish words in a title. */
function headsIn(title: string): string[] {
  return normWords(words(title))
    .map(headOf)
    .filter((h): h is string => !!h);
}

/**
 * A title that names another dish than the one the post is clearly about ("Salade" for a pizza
 * named five times) is replaced by the phrase naming that dish.
 */
export function preferDominantDish(
  title: string | null,
  text: string,
  ingredients: string[] = [],
): string | null {
  const d = dominantDish(text, ingredients);
  if (!d || d.count < 3 || !d.phrase) return title;
  if (!title) return d.phrase;
  const heads = headsIn(title);
  if (heads.some((h) => h === d.head || h.startsWith(d.head) || d.head.startsWith(h))) return title;
  const counts = heads.map((h) => dominantCount(text, h));
  // A title that only names a food of the recipe ("Salade" for the salad served with it) gives
  // way as soon as the other dish is named more often.
  const foods = ingredients.map((x) => normalizeText(x));
  const onlyFoods =
    heads.length > 0 && heads.every((h) => foods.some((f) => f.split(/[\s-]+/).includes(h)));
  if (d.count >= (onlyFoods ? 1 : 2) * Math.max(1, ...counts) + (onlyFoods ? 1 : 0))
    return d.phrase;
  return title;
}

function dominantCount(text: string, head: string): number {
  return normWords(words(text)).filter((n) => headOf(n) === head).length;
}

/**
 * A title ready to show: "COOKIES AU CHOCOLAT ULTRA MOELLEUX" → "Cookies au chocolat ultra
 * moelleux", "poulet coco curry en 20 min" → "Poulet coco curry", no flag, no "(comme en Italie)".
 */
export function tidyTitle(title: string | null): string | null {
  if (!title) return title;
  let t = cleanTitle(title.replace(/\p{Regional_Indicator}/gu, ' '));
  // A time at the end is not part of the name: "… en 20 min", "… in 15 minutes", "(10 min)".
  t = t
    .replace(
      /\s*[([]?\s*(?:en|in|ready in|pret en|prête? en)?\s*(?:moins de\s+|under\s+)?\d+\s*(?:min|mins|minutes?|h|heures?|hours?)(?:\s*chrono)?\s*[)\]]?$/iu,
      '',
    )
    .trim();
  // "LA recette des crêpes de ma grand-mère" → "Crêpes de ma grand-mère".
  const dish = t.replace(
    /^(?:la |ma |notre |my )?(?:recette|recipe)\s+(?:des |de la |du |de |d'|d’|for )/iu,
    '',
  );
  if (dish !== t && dish.length >= 3) t = dish;
  // A remark in brackets at the end of a long title: "Pâte à pizza inratable (comme en Italie)".
  if (t.length > 30) t = t.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  t = t.replace(/[\s,;:.!?…\-–—|/]+$/u, '').trim();
  if (!t) return cleanTitle(title) || title;
  if (t === t.toUpperCase() && /\p{L}{3}/u.test(t)) t = t.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A hook rather than a title: talks to the viewer, exclaims, promises. */
export function isHook(text: string): boolean {
  const n = normalizeText(text);
  return (
    /[!?]/.test(text) ||
    /\b(je|j'|tu|te|t'|vous|on|ton|ta|tes|votre|vos|i|you|your|we)\b/.test(n) ||
    // "Mon péché mignon", "My favourite": the creator, not the dish ("…de ma grand-mère" is).
    /^(mon|ma|mes|my)\b/.test(n) ||
    /peche mignon|guilty pleasure/.test(n) ||
    /\b(jure|regaler|incroyable|tuerie|dingue|meilleur|meilleure|trop bon|pov|best|ever|insane|amazing|must try)\b/.test(
      n,
    ) ||
    HOOK.test(n) ||
    n.split(' ').length > 10
  );
}

/**
 * What creators say or write to make people watch, not to cook: "Je vais vous montrer comment
 * faire les meilleures pâtes de votre vie", "Arrêtez d'acheter des cookies", "Faites ça ce soir
 * et toute la famille va vous remercier", "Stop scrolling, you need to try this". Normalised text.
 */
const HOOK = new RegExp(
  [
    // fr
    'meilleur(e)?s? .{0,40}(de (ta|votre|ma|sa) vie|du monde|que vous)',
    'de (ta|votre|ma) vie',
    '\\bpov\\b',
    "\\barrete[sz]? (de|d'|d’|tout|ca)",
    '\\bstop\\b',
    'je (vais )?(vous|te) (montre|montrer|partage|donne|dis)',
    '(vous|tu) (allez|vas) (adorer|kiffer|craquer|halluciner|tomber|(vous|te) regaler|en redemander)',
    'si (vous aimez|tu aimes)',
    'comment (faire|reussir|realiser)',
    "le secret (pour|de|d'|d’)",
    'la recette (qui|du jour|parfaite|ultime|de ma|de mamie|que)',
    'rend(re)? (fou|folle|dingue|accro)',
    'toute la famille',
    '(faites|fais|testez|teste|essayez|essaie) (ca|cette recette|la)',
    'abonne',
    'buzz',
    'viral',
    'tiktok',
    'instagram',
    'jamais (vu|goute|mange|fait|rate)',
    'en (moins de )?\\d+ (min|minutes) chrono',
    'attend(ez|s)? (la fin|de voir)',
    'regarde[zs]? (ca|cette|moi)',
    'je vous (dis|explique) tout',
    "vous (n'|ne )?allez (pas )?(en )?croire",
    '(salut|coucou|hello) (tout le monde|les amis|la team)',
    "aujourd('|’)?hui (je|on) (vous|te)",
    'on se retrouve',
    'a demain',
    "c'est parti",
    'dites[- ]moi',
    // en
    '\\b(the )?best .{0,40}(ever|of your life|you)',
    'easiest .{0,30}(ever|you)',
    'you need to (try|make)',
    'you have to (try|make)',
    'trust me',
    'game changer',
    'life changing',
    "you won'?t believe",
    'let me show',
    "i('?ll| will)? show you",
    'how to make',
    'try this',
    'make this (tonight|today|now)',
    'stop scrolling',
    'follow for',
    'like and',
    'subscribe',
    'so good',
    'obsessed',
    "today (i|we)('?m| am| are)?",
    'save this',
    'wait (for|till|until)',
  ]
    // Whole words only: "fais ça" is a hook, "fais caraméliser" a step.
    .map((x) => `(?:${x})\\b`)
    .join('|'),
);

/** A sentence that only hooks the viewer, never a step: see HOOK. */
export function isHookSentence(text: string): boolean {
  return HOOK.test(normalizeText(text));
}

/** A title without emoji, hashtags, mentions or a trailing "!!!": "Cookies au chocolat 🍪" → "Cookies au chocolat". */
export function cleanTitle(text: string): string {
  return text
    .replace(/[#@][\p{L}\d_.]+/gu, ' ')
    .replace(/\p{Extended_Pictographic}|\ufe0f|\u200d|\u20e3/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:.!?…\-–—|/]+$/u, '')
    .replace(/^[\s,;:.!?…\-–—|/]+/u, '')
    .trim();
}

/**
 * The title written on a video (read on its first pictures): a short line naming a dish, the one
 * seen most often. Null when none.
 */
export function titleFromScreen(frames: string[][]): string | null {
  const count = new Map<string, { n: number; text: string }>();
  // The title is shown at the start of a reel.
  for (const lines of frames.slice(0, Math.max(3, Math.ceil(frames.length / 3))))
    for (const raw of lines) {
      const line = raw.trim();
      const n = normalizeText(line);
      if (line.length < 4 || line.length > 50 || /\d/.test(line)) continue;
      const nWords = n.split(/\s+/).length;
      if (nWords < 1 || nWords > 6) continue;
      const dish = dishPhrase(line);
      if (!dish) continue;
      const k = normalizeText(dish);
      count.set(k, { n: (count.get(k)?.n ?? 0) + 1, text: dish });
    }
  const best = [...count.values()].sort((a, b) => b.n - a.n)[0];
  return best ? best.text : null;
}

/**
 * The best title from what is known, most reliable first: a title written on the video, a caption
 * that already is a title, the dish named in the caption's first sentences, the dish named in
 * what is said, then the caption's first sentence as it is.
 */
export function bestTitle(p: {
  screen?: string | null;
  captionFirst?: string | null;
  caption?: string | null;
  speech?: string | null;
  /** The recipe's foods: a food named often is not the dish ("pain de mie" in a croque). */
  ingredients?: string[];
}): string | null {
  if (p.screen) return tidyTitle(p.screen) || p.screen;
  const all = [p.captionFirst, p.caption, p.speech?.slice(0, 600)].filter(Boolean).join('\n');
  const pick = (t: string | null) => tidyTitle(preferDominantDish(t, all, p.ingredients));
  const first = p.captionFirst ? cleanTitle(p.captionFirst) || null : null;
  // "Petite salade ? Non, pizza…": a question is never the title.
  const question = !!p.captionFirst && /[?？]/.test(p.captionFirst);
  if (first && !question && !isHook(first) && first.length <= 60) return pick(first);
  const opening = (p.caption ?? '').split('\n').slice(0, 3).join(' ');
  const fromCaption = (first && dishPhrase(first)) || dishPhrase(opening);
  if (fromCaption) return pick(fromCaption);
  const fromSpeech = p.speech ? dishPhrase(p.speech.slice(0, 300)) : null;
  if (fromSpeech) return pick(fromSpeech);
  return pick(first);
}

/**
 * The caption kept in the notes while the recipe was incomplete, once the video completed it:
 * only what was not used stays (the story, a tip), not the ingredients, headers and hashtags
 * again. Null when nothing is left.
 */
export function pruneCaptionNotes(
  notes: string | null,
  used: { title: string | null; ingredients: { name: string }[] },
): string | null {
  if (!notes) return null;
  const names = used.ingredients.map((i) => normalizeText(i.name)).filter((n) => n.length >= 3);
  const title = used.title ? normalizeText(used.title) : '';
  const kept = notes.split('\n').filter((raw) => {
    const l = raw.trim();
    if (!l) return false;
    const n = normalizeText(l);
    if (/^(?:[#@][\p{L}\d_.]+\s*)+$/u.test(l)) return false;
    if (
      /^\W*(ingredients?|preparation|etapes?|recette|instructions?|steps?|method)\b.{0,40}$/.test(n)
    )
      return false;
    if (title && n.includes(title)) return false;
    return !names.some((name) => n.includes(name) && n.length <= name.length + 30);
  });
  const text = kept.join('\n').trim();
  return text ? text.slice(0, 5000) : null;
}
