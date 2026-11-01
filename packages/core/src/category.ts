import type { RecipeCategory } from './enums';
import { singularize, tokenize } from './text';

/**
 * The category of a recipe deduced from its name, then from its ingredients, when it came
 * without one (a social post, a photo, a dictation): "Pennes au poulet" goes into Pasta, a
 * salmon dish into Fish. Fixed word lists (French and English), no AI. Null when unsure: the
 * user can always choose it.
 */

/** Words (singular, accents removed) or phrases ("salade de fruit") per category. */
const WORDS: [RecipeCategory, string[]][] = [
  [
    'drinks',
    'smoothie,smoothies,cocktail,mocktail,limonade,citronnade,lemonade,milkshake,latte,chocolat chaud,hot chocolate,the glace,iced tea,jus d orange,orange juice,sirop,sangria,lassi,boisson,drink,infusion'.split(
      ',',
    ),
  ],
  [
    'breakfast',
    'petit dejeuner,petit-dejeuner,breakfast,brunch,porridge,granola,muesli,pancake,overnight oat,pain perdu,french toast,gaufre,waffle,crepe,oeuf brouille,scrambled egg,omelette'.split(
      ',',
    ),
  ],
  [
    'dessert',
    'dessert,gateau,cake,tarte au citron,tarte aux pomme,tarte tatin,tartelette,cookie,cookies,brownie,brownies,muffin,cupcake,mousse au chocolat,tiramisu,crumble,cheesecake,flan,clafouti,fondant,moelleux,panna cotta,creme brulee,creme dessert,glace,sorbet,macaron,financier,madeleine,cannele,charlotte,pavlova,meringue,profiterole,eclair,beignet,churro,riz au lait,salade de fruit,compote,donut,banana bread,sweet,ice cream'.split(
      ',',
    ),
  ],
  [
    'soup',
    'soupe,veloute,potage,bouillon,gaspacho,gazpacho,minestrone,chowder,bisque,soup,broth,pho'.split(
      ',',
    ),
  ],
  [
    'pasta',
    'pate,pasta,penne,spaghetti,tagliatelle,linguine,fusilli,farfalle,rigatoni,macaroni,coquillette,lasagne,lasagna,gnocchi,ravioli,tortellini,cannelloni,nouille,noodle,udon,ramen,soba,carbonara,bolognaise,bolognese,orzo,pad thai'.split(
      ',',
    ),
  ],
  ['salad', 'salade,salad,taboule,tabbouleh,coleslaw,poke,buddha bowl'.split(',')],
  [
    'appetizer',
    'apero,aperitif,appetizer,houmous,hummus,tapenade,guacamole,rillette,verrine,bouchee,amuse bouche,dip,tartinade,tzatziki,caviar d aubergine,feuillete,gougere,blini,nachos'.split(
      ',',
    ),
  ],
  [
    'fish',
    'poisson,saumon,cabillaud,thon,crevette,gambas,moule,lieu,dorade,daurade,bar,colin,merlu,sardine,maquereau,truite,sole,saint jacques,coquille saint jacques,calamar,poulpe,fruit de mer,fish,salmon,cod,tuna,shrimp,prawn,mussel,seafood,scallop,squid'.split(
      ',',
    ),
  ],
  [
    'meat',
    'poulet,boeuf,porc,veau,agneau,canard,dinde,steak,entrecote,burger,saucisse,chorizo,lardon,jambon,cote de porc,roti,blanquette,bourguignon,hachis parmentier,boulette,kebab,chicken,beef,pork,lamb,duck,turkey,sausage,bacon,meatball,ribs'.split(
      ',',
    ),
  ],
  [
    'baking',
    'pain,bread,brioche,focaccia,baguette,fougasse,naan,pita,bagel,croissant,viennoiserie,pate a pizza,pizza dough,levain,sourdough'.split(
      ',',
    ),
  ],
  [
    'main',
    'pizza,quiche,tarte salee,gratin,risotto,paella,couscous,tajine,tagine,chili,curry,wok,sandwich,wrap,taco,tacos,burrito,quesadilla,croque monsieur,hachis,parmentier'.split(
      ',',
    ),
  ],
  [
    'side',
    'puree,mash,frite,fries,accompagnement,side dish,legumes rotis,roasted vegetable,riz pilaf,pilaf,gratin dauphinois,poelee'.split(
      ',',
    ),
  ],
  [
    'vegetarian',
    'vegetarien,vegetarienne,vegetarian,vegan,vegane,veggie,dahl,dal,falafel,tofu,tempeh,seitan'.split(
      ',',
    ),
  ],
];

/** A sauce is a sauce only when its name starts with it ("Poulet sauce moutarde" is chicken). */
const SAUCE_FIRST =
  'sauce,pesto,vinaigrette,mayonnaise,aioli,ketchup,coulis,chutney,dressing'.split(',');
/** Pastry, not pasta: "pâte brisée", "pâte à crêpes". */
const PASTRY_AFTER = new Set(['a', 'brisee', 'feuilletee', 'sablee', 'filo', 'phyllo', 'levee']);
/** Only the beginning of a name or an ingredient is read (pasted texts can be huge). */
const MAX_CHARS = 200;
const MAX_INGREDIENTS = 80;

/** "Pennes au poulet" → its words, singular (["penne", "au", "poulet"]); "pâte brisée" → pastry. */
const words = (s: string) => {
  const w = tokenize(s.slice(0, MAX_CHARS)).map(singularize);
  return w.map((x, i) => (x === 'pate' && PASTRY_AFTER.has(w[i + 1] ?? '') ? 'pastry' : x));
};

/** Word lists turned into words once: one-word entries in a set, phrases as word arrays. */
interface Compiled {
  single: Set<string>;
  phrases: string[][];
}
function compile(list: string[]): Compiled {
  const single = new Set<string>();
  const phrases: string[][] = [];
  for (const w of list) {
    const p = words(w);
    if (p.length === 1) single.add(p[0]!);
    else if (p.length > 1) phrases.push(p);
  }
  return { single, phrases };
}
function matches(text: string[], c: Compiled): boolean {
  if (text.some((w) => c.single.has(w))) return true;
  return c.phrases.some((p) => {
    for (let i = 0; i + p.length <= text.length; i++)
      if (p.every((w, k) => text[i + k] === w)) return true;
    return false;
  });
}

const COMPILED: [RecipeCategory, Compiled][] = WORDS.map(([cat, list]) => [cat, compile(list)]);
const SAUCE = SAUCE_FIRST.map((w) => words(w));
/** Ingredients that make a dish what it is, when its name says nothing. */
const MAIN_INGREDIENT = COMPILED.filter(([c]) => c === 'pasta' || c === 'fish' || c === 'meat');
const SUGAR = compile(['sucre', 'sugar']);
const FLOUR = compile(['farine', 'flour']);

export function guessCategory(r: {
  title: string;
  ingredients: { name: string }[];
}): RecipeCategory | null {
  const title = words(r.title);
  if (SAUCE.some((p) => p.every((w, k) => title[k] === w))) return 'sauce';
  // "Pennes au poulet" is pasta before it is meat; "Salade de poulet" a salad; a chicken curry
  // is meat: the order of WORDS settles it.
  for (const [cat, c] of COMPILED) if (matches(title, c)) return cat;
  const names = r.ingredients.slice(0, MAX_INGREDIENTS).map((i) => words(i.name));
  for (const [cat, c] of MAIN_INGREDIENT) if (names.some((n) => matches(n, c))) return cat;
  // Sugar and flour, and nothing savoury: something sweet from the oven.
  if (names.some((n) => matches(n, SUGAR)) && names.some((n) => matches(n, FLOUR)))
    return 'dessert';
  return null;
}
