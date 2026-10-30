import { singularize, tokenize } from './text';

/**
 * Cuisines of the world, each tied to a country (ISO 3166 alpha-2) for the cuisine map. The
 * cuisine of a recipe is chosen by the user, or deduced from its title, tags and ingredients
 * with fixed word lists (French and English), no AI.
 */
export const CUISINES = [
  'french',
  'italian',
  'spanish',
  'portuguese',
  'greek',
  'maghreb',
  'lebanese',
  'turkish',
  'indian',
  'thai',
  'vietnamese',
  'chinese',
  'japanese',
  'korean',
  'mexican',
  'american',
  'british',
  'german',
  'scandinavian',
  'brazilian',
  'peruvian',
  'caribbean',
  'westAfrican',
  'ethiopian',
] as const;
export type Cuisine = (typeof CUISINES)[number];

/** Country shown on the map, and the flag. */
export const CUISINE_COUNTRY: Record<Cuisine, string> = {
  french: 'FR',
  italian: 'IT',
  spanish: 'ES',
  portuguese: 'PT',
  greek: 'GR',
  maghreb: 'MA',
  lebanese: 'LB',
  turkish: 'TR',
  indian: 'IN',
  thai: 'TH',
  vietnamese: 'VN',
  chinese: 'CN',
  japanese: 'JP',
  korean: 'KR',
  mexican: 'MX',
  american: 'US',
  british: 'GB',
  german: 'DE',
  scandinavian: 'SE',
  brazilian: 'BR',
  peruvian: 'PE',
  caribbean: 'JM',
  westAfrican: 'SN',
  ethiopian: 'ET',
};

/** Flag emoji of a country code. */
export function flagOf(country: string): string {
  return [...country.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

const list = (s: string) =>
  s
    .split(',')
    .map((w) => tokenize(w.trim()).map(singularize))
    .filter((t) => t.length);

/**
 * Signature dishes and words (strong: in the title or tags they decide alone) and typical
 * ingredients (weak: they add up). Words are matched whole, after accents and plurals.
 */
const RULES: Record<Cuisine, { strong: string; weak: string }> = {
  french: {
    strong:
      'boeuf bourguignon,blanquette,ratatouille,quiche,gratin dauphinois,coq au vin,tartiflette,raclette,cassoulet,bouillabaisse,pot au feu,croque monsieur,crepe,galette bretonne,clafoutis,tarte tatin,creme brulee,madeleine,financier,soupe a l oignon,hachis parmentier,choucroute,fondue savoyarde,gougere,parmentier,brandade,salade nicoise,piperade,francais,francaise,french',
    weak: 'herbes de provence,gruyere,comte,reblochon,creme fraiche,echalote,estragon,cognac,dijon,beurre demi sel,camembert,roquefort',
  },
  italian: {
    strong:
      'risotto,lasagne,lasagna,carbonara,bolognaise,bolognese,pizza,gnocchi,tiramisu,panna cotta,minestrone,osso buco,focaccia,arancini,saltimbocca,pesto,cannelloni,ravioli,tortellini,amatriciana,cacio e pepe,vitello tonnato,bruschetta,polenta,italien,italienne,italian',
    weak: 'parmesan,parmigiano,mozzarella,ricotta,mascarpone,basilic,basil,pancetta,prosciutto,pecorino,spaghetti,penne,tagliatelle,fusilli,linguine,orecchiette,balsamique,balsamic,roquette,arugula',
  },
  spanish: {
    strong:
      'paella,gazpacho,tortilla espanola,tortilla de patatas,churros,patatas bravas,crema catalana,salmorejo,pimientos de padron,tapas,espagnol,espagnole,spanish',
    weak: 'chorizo,manchego,piment d espelette,pimenton,paprika fume,smoked paprika,jamon,serrano,safran,saffron',
  },
  portuguese: {
    strong:
      'pastel de nata,pasteis de nata,bacalhau,caldo verde,francesinha,portugais,portugaise,portuguese',
    weak: 'morue,piri piri',
  },
  greek: {
    strong:
      'moussaka,tzatziki,souvlaki,spanakopita,gyros,pastitsio,horiatiki,salade grecque,greek salad,baklava,dolmades,grec,grecque,greek',
    weak: 'feta,origan,oregano,olive kalamata,kalamata',
  },
  maghreb: {
    strong:
      'couscous,tajine,tagine,harira,chakchouka,shakshuka,pastilla,bastilla,brick,brik,makroud,merguez,marocain,marocaine,moroccan,tunisien,algerien',
    weak: 'ras el hanout,harissa,citron confit,preserved lemon,semoule,eau de fleur d oranger,cumin,coriandre fraiche',
  },
  lebanese: {
    strong:
      'houmous,hummus,taboule,tabbouleh,falafel,baba ganoush,moutabal,fattoush,kebbe,kibbeh,chawarma,shawarma,labneh,manakish,libanais,libanaise,lebanese,mezze',
    weak: 'tahini,tahin,sumac,zaatar,za atar,pois chiche,chickpea,boulgour,bulgur,grenade,pomegranate',
  },
  turkish: {
    strong: 'kebab,kofte,lahmacun,pide,borek,menemen,imam bayildi,turc,turque,turkish',
    weak: 'yaourt turc,pul biber,urfa',
  },
  indian: {
    strong:
      'curry,dal,dhal,tikka masala,butter chicken,biryani,naan,chapati,samosa,pakora,korma,vindaloo,tandoori,palak paneer,chana masala,raita,lassi,chutney,indien,indienne,indian',
    weak: 'garam masala,curcuma,turmeric,cardamome,cardamom,paneer,ghee,graine de moutarde,mustard seed,fenugrec,fenugreek,lentille corail,red lentil,basmati,lait de coco,coconut milk',
  },
  thai: {
    strong:
      'pad thai,tom yum,tom kha,curry vert,green curry,curry rouge,red curry,massaman,som tam,larb,thai,thailandais,thailandaise',
    weak: 'citronnelle,lemongrass,galanga,galangal,feuille de kaffir,kaffir,sauce poisson,fish sauce,nuoc mam,basilic thai,thai basil,lait de coco,coconut milk',
  },
  vietnamese: {
    strong:
      'pho,bo bun,banh mi,nem,rouleau de printemps,spring roll,banh xeo,bun cha,vietnamien,vietnamienne,vietnamese',
    weak: 'vermicelle de riz,rice vermicelli,galette de riz,rice paper,nuoc mam,menthe,mint,cacahuete,peanut',
  },
  chinese: {
    strong:
      'cantonais,riz cantonais,dim sum,raviolis chinois,dumpling,porc aigre doux,sweet and sour,kung pao,mapo tofu,chow mein,char siu,canard laque,peking duck,wonton,bao,chinois,chinoise,chinese',
    weak: 'sauce soja,soy sauce,sauce huitre,oyster sauce,gingembre,ginger,sesame,huile de sesame,sesame oil,cinq epices,five spice,anis etoile,star anise,bok choy,shaoxing,wok',
  },
  japanese: {
    strong:
      'sushi,maki,ramen,udon,soba,tempura,teriyaki,gyoza,okonomiyaki,miso soup,soupe miso,yakitori,tonkatsu,onigiri,donburi,matcha,mochi,japonais,japonaise,japanese',
    weak: 'miso,mirin,sake,dashi,wasabi,nori,algue,seaweed,panko,edamame,tofu,shiitake',
  },
  korean: {
    strong:
      'kimchi,bibimbap,bulgogi,tteokbokki,japchae,korean fried chicken,poulet frit coreen,coreen,coreenne,korean',
    weak: 'gochujang,gochugaru,doenjang',
  },
  mexican: {
    strong:
      'tacos,taco,burrito,enchilada,quesadilla,guacamole,chili con carne,fajitas,nachos,tamales,mole,pozole,ceviche mexicain,mexicain,mexicaine,mexican,tex mex',
    weak: 'tortilla,piment jalapeno,jalapeno,chipotle,haricot rouge,kidney bean,black bean,haricot noir,coriandre,cilantro,citron vert,lime,avocat,avocado,mais,corn',
  },
  american: {
    strong:
      'burger,hamburger,cheeseburger,pancake,brownie,cookie,cheesecake,mac and cheese,coleslaw,hot dog,pulled pork,barbecue,bbq,muffin,apple pie,banana bread,cornbread,buffalo wings,americain,americaine,american',
    weak: 'sirop d erable,maple syrup,beurre de cacahuete,peanut butter,cheddar,buttermilk,babeurre',
  },
  british: {
    strong:
      'fish and chips,crumble,scone,shepherd s pie,shepherd pie,cottage pie,sunday roast,yorkshire pudding,trifle,sticky toffee,porridge,anglais,anglaise,british,english',
    weak: 'sauce worcestershire,worcestershire,stilton,golden syrup,mint sauce',
  },
  german: {
    strong:
      'bretzel,pretzel,strudel,apfelstrudel,schnitzel,spaetzle,sauerkraut,foret noire,black forest,stollen,currywurst,allemand,allemande,german',
    weak: 'chou rouge,red cabbage,cumin des pres,caraway,saucisse de francfort,frankfurter',
  },
  scandinavian: {
    strong:
      'gravlax,smorrebrod,kanelbulle,brioche suedoise,boulettes suedoises,swedish meatball,lefse,suedois,suedoise,danois,norvegien,swedish,danish,norwegian,scandinave,scandinavian',
    weak: 'aneth,dill,airelle,lingonberry,hareng,herring,cardamome',
  },
  brazilian: {
    strong:
      'feijoada,pao de queijo,brigadeiro,moqueca,coxinha,acai,bresilien,bresilienne,brazilian',
    weak: 'manioc,cassava,farofa,dende',
  },
  peruvian: {
    strong: 'ceviche,lomo saltado,causa,aji de gallina,peruvien,peruvienne,peruvian',
    weak: 'aji amarillo,quinoa,patate douce,sweet potato',
  },
  caribbean: {
    strong:
      'colombo,accras,acras,jerk chicken,poulet boucane,rougail,blaff,ti punch,antillais,antillaise,creole,jamaicain,caribbean,jamaican',
    weak: 'piment antillais,scotch bonnet,bois d inde,allspice,piment de la jamaique,banane plantain,plantain,igname,yam,rhum,rum',
  },
  westAfrican: {
    strong:
      'mafe,thieboudienne,yassa,jollof,alloco,poulet dg,ndole,attieke,senegalais,senegalaise,ivoirien,camerounais,african,africain,africaine',
    weak: 'pate d arachide,arachide,gombo,okra,feuille de manioc,attieke',
  },
  ethiopian: {
    strong: 'injera,doro wat,berbere,tibs,kitfo,ethiopien,ethiopienne,ethiopian',
    weak: 'teff,niter kibbeh',
  },
};

const COMPILED = (Object.keys(RULES) as Cuisine[]).map((c) => ({
  cuisine: c,
  strong: list(RULES[c].strong),
  weak: list(RULES[c].weak),
}));

function has(toks: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length && ok; j++) ok = toks[i + j] === phrase[j];
    if (ok) return true;
  }
  return false;
}

/**
 * Cuisine of a recipe, or null when nothing is clear. A signature word in the title or the tags
 * decides; otherwise at least two typical ingredients of one cuisine, and more than any other.
 */
export function detectCuisine(r: {
  title: string;
  tags?: string[];
  ingredients: { name: string }[];
}): Cuisine | null {
  const head = tokenize([r.title, ...(r.tags ?? [])].join(' , ')).map(singularize);
  for (const c of COMPILED) if (c.strong.some((p) => has(head, p))) return c.cuisine;
  const names = r.ingredients.map((i) => tokenize(i.name).map(singularize));
  const scores = COMPILED.map((c) => ({
    cuisine: c.cuisine,
    score: names.filter((n) => c.weak.some((p) => has(n, p))).length,
  })).sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  if (!first || first.score < 2 || first.score === second?.score) return null;
  return first.cuisine;
}

/** The cuisine chosen by the user, or else the one deduced. */
export function recipeCuisine(r: {
  cuisine?: Cuisine | null;
  title: string;
  tags?: string[];
  ingredients: { name: string }[];
}): Cuisine | null {
  return r.cuisine ?? detectCuisine(r);
}
