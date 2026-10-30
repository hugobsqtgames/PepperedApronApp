import type { RecipeCategory } from './enums';
import type { Cuisine } from './cuisine';
import { isMeatOrFish } from './diet';
import { singularize, tokenize } from './text';

/**
 * What goes well with a dish: a drink (always with an alcohol-free choice) and a side. Fixed
 * rules from the category, the cuisine and the main ingredients; the app shows translated
 * sentences for each key. Nothing is sent anywhere.
 */
export const DRINK_PAIRINGS = [
  'whiteDry',
  'whiteRich',
  'red_light',
  'red_full',
  'rose',
  'sparkling',
  'sweetWine',
  'beer',
  'cider',
  'sake',
  'mintTea',
  'greenTea',
  'blackTea',
  'coffee',
  'lassi',
  'lemonade',
  'sparklingWater',
  'juice',
  'hotChocolate',
] as const;
export type DrinkPairing = (typeof DRINK_PAIRINGS)[number];

export const SIDE_PAIRINGS = [
  'greenSalad',
  'crustyBread',
  'rice',
  'roastedVegetables',
  'mash',
  'fries',
  'steamedGreens',
  'naan',
  'flatbread',
  'pickles',
  'yogurtSauce',
  'redFruit',
  'whippedCream',
  'tortillaChips',
  'kimchi',
  'couscous',
] as const;
export type SidePairing = (typeof SIDE_PAIRINGS)[number];

export interface Pairings {
  /** Wine, beer or cider when it suits the dish; null for breakfast, drinks… */
  drink: DrinkPairing | null;
  /** Always set: the alcohol-free idea. */
  soft: DrinkPairing;
  /** Null when the dish is already complete (soup with bread, salad…). */
  side: SidePairing | null;
}

const words = (s: string) =>
  s
    .split(',')
    .map((w) => tokenize(w.trim()).map(singularize))
    .filter((t) => t.length);

const FISH = words(
  'poisson,saumon,cabillaud,thon,truite,dorade,daurade,bar,loup,sole,lieu,colin,merlu,crevette,gamba,saint jacques,moule,huitre,calamar,poulpe,crabe,homard,fruit de mer,fish,salmon,cod,tuna,trout,shrimp,prawn,scallop,mussel,oyster,squid,crab,lobster,seafood',
);
const RED_MEAT = words(
  'boeuf,agneau,canard,gibier,chevreuil,sanglier,magret,steak,entrecote,bavette,viande hachee,beef,lamb,duck,venison,steak,mince',
);
const WHITE_MEAT = words('poulet,dinde,volaille,porc,veau,lapin,chicken,turkey,pork,veal,rabbit');
const CHEESE = words(
  'fromage,raclette,reblochon,comte,gruyere,emmental,camembert,brie,roquefort,cheddar,cheese,fondue',
);
const CREAM = words('creme,beurre,cream,butter');
const SPICY = words(
  'curry,piment,harissa,chili,jalapeno,gochujang,sriracha,cayenne,chipotle,ras el hanout,berbere',
);
const TOMATO = words('tomate,tomato,sauce tomate,passata');
const CHOCOLATE = words('chocolat,cacao,chocolate,cocoa');
const FRUIT = words(
  'fraise,framboise,pomme,poire,peche,abricot,cerise,citron,orange,mangue,ananas,banane,myrtille,strawberry,raspberry,apple,pear,peach,apricot,cherry,lemon,mango,pineapple,banana,blueberry',
);

function anyIn(names: string[][], list: string[][]): boolean {
  return names.some((n) =>
    list.some((p) => {
      for (let i = 0; i + p.length <= n.length; i++) {
        let ok = true;
        for (let j = 0; j < p.length && ok; j++) ok = n[i + j] === p[j];
        if (ok) return true;
      }
      return false;
    }),
  );
}

export function pairingsFor(r: {
  title: string;
  category: RecipeCategory | null;
  cuisine: Cuisine | null;
  ingredients: { name: string }[];
}): Pairings {
  const names = [r.title, ...r.ingredients.map((i) => i.name)].map((n) =>
    tokenize(n).map(singularize),
  );
  const has = (l: string[][]) => anyIn(names, l);
  const meat = r.ingredients.some((i) => isMeatOrFish(i.name));
  const c = r.cuisine;

  // Sweet things and breakfast: no wine.
  if (r.category === 'dessert' || r.category === 'baking' || r.category === 'snack') {
    if (has(CHOCOLATE))
      return { drink: null, soft: 'coffee', side: has(FRUIT) ? null : 'redFruit' };
    if (has(FRUIT)) return { drink: 'sweetWine', soft: 'blackTea', side: 'whippedCream' };
    return { drink: null, soft: r.category === 'snack' ? 'hotChocolate' : 'blackTea', side: null };
  }
  if (r.category === 'breakfast')
    return { drink: null, soft: 'juice', side: has(FRUIT) ? null : 'redFruit' };
  if (r.category === 'drinks') return { drink: null, soft: 'sparklingWater', side: null };
  if (r.category === 'appetizer')
    return { drink: 'sparkling', soft: 'lemonade', side: c === 'mexican' ? 'tortillaChips' : null };

  // Cuisines with their own habits come first.
  if (c === 'japanese')
    return { drink: 'sake', soft: 'greenTea', side: has(words('riz,rice')) ? 'pickles' : 'rice' };
  if (c === 'indian')
    return { drink: 'beer', soft: 'lassi', side: has(words('riz,rice')) ? 'naan' : 'rice' };
  if (c === 'thai' || c === 'vietnamese' || c === 'chinese')
    return {
      drink: has(SPICY) ? 'whiteRich' : 'beer',
      soft: 'greenTea',
      side: has(words('riz,rice,nouille,noodle,vermicelle')) ? null : 'rice',
    };
  if (c === 'korean')
    return { drink: 'beer', soft: 'greenTea', side: has(words('kimchi')) ? 'rice' : 'kimchi' };
  if (c === 'maghreb')
    return {
      drink: 'red_light',
      soft: 'mintTea',
      side: has(words('couscous,semoule')) ? null : 'couscous',
    };
  if (c === 'lebanese' || c === 'turkish' || c === 'greek')
    return { drink: 'rose', soft: 'mintTea', side: 'flatbread' };
  if (c === 'mexican') return { drink: 'beer', soft: 'lemonade', side: 'tortillaChips' };
  if (c === 'ethiopian' || c === 'westAfrican')
    return { drink: 'beer', soft: 'juice', side: has(words('riz,rice')) ? null : 'rice' };
  if (c === 'british' && has(FISH))
    return {
      drink: 'beer',
      soft: 'lemonade',
      side: has(words('frite,chips,fries')) ? null : 'fries',
    };

  if (r.category === 'soup')
    return { drink: has(CREAM) ? 'whiteRich' : null, soft: 'sparklingWater', side: 'crustyBread' };
  if (r.category === 'salad')
    return {
      drink: 'rose',
      soft: 'lemonade',
      side: has(words('pain,bread')) ? null : 'crustyBread',
    };
  if (has(CHEESE) && (has(words('raclette,fondue,tartiflette,reblochon')) || !meat))
    return { drink: 'whiteDry', soft: 'blackTea', side: 'greenSalad' };
  if (has(FISH))
    return {
      drink: has(CREAM) ? 'whiteRich' : 'whiteDry',
      soft: 'sparklingWater',
      side: has(words('riz,rice,pomme de terre,potato,pate,pasta')) ? 'steamedGreens' : 'rice',
    };
  if (has(RED_MEAT))
    return {
      drink: has(words('mijote,bourguignon,daube,braise,stew,civet')) ? 'red_full' : 'red_light',
      soft: 'sparklingWater',
      side: has(words('pomme de terre,potato,frite,fries,puree')) ? 'greenSalad' : 'mash',
    };
  if (has(WHITE_MEAT))
    return {
      drink: has(CREAM)
        ? 'whiteRich'
        : has(words('porc,pork,saucisse,sausage'))
          ? 'cider'
          : 'red_light',
      soft: 'lemonade',
      side: has(words('pomme de terre,potato,riz,rice,pate,pasta'))
        ? 'greenSalad'
        : 'roastedVegetables',
    };
  if (r.category === 'pasta' || c === 'italian')
    return {
      drink: has(TOMATO) ? 'red_light' : 'whiteDry',
      soft: 'sparklingWater',
      side: 'greenSalad',
    };
  if (has(SPICY)) return { drink: 'beer', soft: 'lassi', side: 'yogurtSauce' };
  if (r.category === 'side' || r.category === 'sauce')
    return { drink: null, soft: 'sparklingWater', side: null };
  return { drink: meat ? 'red_light' : 'whiteDry', soft: 'sparklingWater', side: 'greenSalad' };
}
