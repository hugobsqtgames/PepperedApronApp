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
    'i,you,we,they,he,she,it,is,are,was,will,this,that,so,really,very,best,ever,recipe,recipes,for,but,when,if,here,today,made,make,try,let'
  ).split(','),
);
/** Small words that can be inside a dish name: "pâtes AU poulet", "tarte AUX pommes". */
const LINK = new Set('au,aux,a,la,l,de,du,des,d,en,et,with,and,of,in'.split(','));
const DETERMINERS = new Set(
  'les,des,ces,mes,une,un,la,le,l,du,de,the,a,an,my,these,some'.split(','),
);

/** Words, apostrophes and punctuation of a text, without emoji, hashtags or mentions. */
const words = (s: string): string[] =>
  s
    .replace(/[#@][\p{L}\d_.]+/gu, ' ')
    .match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*|['’]|[,;:.!?…()"«»“”]/gu) ?? [];

function sentenceCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

/**
 * The dish named in a sentence, or null: "Avec ces pennes au poulet je te jure…" → "Pennes au
 * poulet". At most 7 words; it never ends on a small word ("pâtes au").
 */
export function dishPhrase(text: string): string | null {
  const ws = words(text);
  const norm = ws.map((w) => normalizeText(w).replace(/['’]/g, ''));
  for (let i = 0; i < ws.length; i++) {
    if (!DISH_HEADS.has(norm[i]!)) continue;
    const out: string[] = [ws[i]!];
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
    const phrase = out.join(' ').replace(/\s*(['’])\s*/g, '$1');
    // A dish word alone after "avec du" is an ingredient ("avec du poulet"), unless nothing else.
    if (
      out.length === 1 &&
      i > 0 &&
      DETERMINERS.has(norm[i - 1]!) &&
      /^(du|de|des)$/.test(norm[i - 1]!)
    )
      continue;
    return sentenceCase(phrase);
  }
  return null;
}

/** A hook rather than a title: talks to the viewer, exclaims, promises. */
export function isHook(text: string): boolean {
  const n = normalizeText(text);
  return (
    /[!?]/.test(text) ||
    /\b(je|j'|tu|te|t'|vous|on|ton|ta|tes|votre|vos|i|you|your|we)\b/.test(n) ||
    /\b(jure|regaler|incroyable|tuerie|dingue|meilleur|meilleure|trop bon|pov|best|ever|insane|amazing|must try)\b/.test(
      n,
    ) ||
    n.split(' ').length > 10
  );
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
}): string | null {
  if (p.screen) return p.screen;
  const first = p.captionFirst?.trim() || null;
  if (first && !isHook(first) && first.length <= 60) return first;
  const opening = (p.caption ?? '').split('\n').slice(0, 3).join(' ');
  const fromCaption = (first && dishPhrase(first)) || dishPhrase(opening);
  if (fromCaption) return fromCaption;
  const fromSpeech = p.speech ? dishPhrase(p.speech.slice(0, 300)) : null;
  if (fromSpeech) return fromSpeech;
  return first;
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
