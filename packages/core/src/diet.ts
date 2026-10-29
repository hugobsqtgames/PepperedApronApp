import { singularize, tokenize } from './text';

/**
 * Automatic labels deduced from the ingredient names with fixed word lists (French and English),
 * no AI. A label is only given when every ingredient was checked: an unknown processed product
 * (stock cube, sauce…) that may hide meat or gluten is treated conservatively.
 */
export const DIET_TAGS = ['vegetarian', 'vegan', 'glutenFree'] as const;
export type DietTag = (typeof DIET_TAGS)[number];

const words = (list: string) =>
  list
    .split(',')
    .map((w) => tokenize(w.trim()).map(singularize))
    .filter((t) => t.length);

/** Meat, fish, seafood and gelatine. */
const MEAT = words(
  'poulet,poule,volaille,dinde,canard,oie,caille,pintade,boeuf,veau,porc,cochon,agneau,mouton,lapin,cheval,gibier,chevreuil,sanglier,' +
    'jambon,lard,lardon,bacon,saucisse,saucisson,chorizo,merguez,chipolata,andouille,andouillette,boudin,steak,viande,bavette,entrecote,' +
    'onglet,faux filet,filet mignon,escalope,cordon bleu,nugget,gesier,foie,magret,pancetta,prosciutto,coppa,speck,bresaola,salami,' +
    'pepperoni,mortadelle,rillette,rosette,kebab,pastrami,anchois,thon,saumon,cabillaud,morue,colin,merlu,lieu,dorade,daurade,loup,' +
    'sole,turbot,sardine,maquereau,truite,hareng,haddock,lotte,raie,espadon,tilapia,panga,crevette,gamba,langoustine,homard,langouste,' +
    'crabe,tourteau,calamar,calmar,encornet,poulpe,seiche,saint jacques,huitre,palourde,bulot,bigorneau,surimi,poisson,fruit de mer,' +
    'caviar,oeuf de lump,gelatine,nuoc mam,sauce poisson,worcestershire,' +
    'chicken,hen,turkey,duck,goose,quail,beef,veal,pork,lamb,mutton,rabbit,venison,ham,sausage,steak,meat,mince,meatball,brisket,' +
    'sirloin,tenderloin,ribeye,pepperoni,salami,anchovy,tuna,salmon,cod,haddock,halibut,hake,pollock,trout,mackerel,herring,tilapia,' +
    'shrimp,prawn,lobster,crab,squid,octopus,mussel,clam,oyster,scallop,fish,seafood,gelatin,fish sauce,jerky',
);

/** Animal products allowed in a vegetarian diet but not in a vegan one. */
const ANIMAL = words(
  'oeuf,jaune d oeuf,blanc d oeuf,lait,beurre,creme,fromage,yaourt,yogourt,mascarpone,ricotta,mozzarella,burrata,parmesan,pecorino,feta,' +
    'gruyere,emmental,comte,chevre,roquefort,camembert,brie,raclette,reblochon,cheddar,beaufort,cantal,mimolette,gorgonzola,' +
    'petit suisse,faisselle,ghee,lactoserum,miel,mayonnaise,meringue,brioche,' +
    'egg,yolk,milk,butter,cream,cheese,yogurt,yoghurt,whey,buttermilk,honey,custard',
);

/** Plant versions: "lait de coco", "beurre de cacahuète", "crème de marrons", "steak végétal". */
const PLANT_MARKS = words(
  'coco,amande,avoine,soja,riz,noisette,cajou,cacahuete,arachide,marron,chataigne,karite,vegetal,vegetale,vegetarien,vegetarienne,' +
    'vegan,vegane,vege,tofu,coconut,almond,oat,soy,rice,hazelnut,cashew,peanut,plant,vegetarian,meatless,beyond',
);

/** Foods that contain (or usually contain) gluten. */
const GLUTEN = words(
  'farine,ble,froment,epeautre,seigle,orge,avoine,kamut,semoule,couscous,boulgour,pate,spaghetti,spaghetto,tagliatelle,penne,fusilli,' +
    'macaroni,linguine,farfalle,coquillette,lasagne,ravioli,gnocchi,nouille,vermicelle,pain,baguette,chapelure,biscuit,brioche,' +
    'croissant,tortilla,wrap,pita,naan,crouton,panko,biere,malt,seitan,sauce soja,cube de bouillon,bouillon cube,cube bouillon,gateau,genoise,sable,speculoos,' +
    'cookie,pizza,cracker,biscotte,chapati,blini,crepe,gaufre,' +
    'flour,wheat,barley,rye,spelt,oat,semolina,bulgur,pasta,noodle,bread,breadcrumb,beer,soy sauce,stock cube,cake,crust,dough,' +
    'pastry,bun,bagel,muffin,graham',
);

/** Gluten-free versions: "farine de riz", "nouilles de riz", "pâte de curry", "sans gluten". */
const GLUTEN_FREE_MARKS = words(
  'riz,mais,sarrasin,chataigne,pois chiche,coco,amande,manioc,tapioca,quinoa,sans gluten,curry,tamari,dattes,sesame,tamarin,' +
    'piment,arachide,tartiner,fruit,coing,maize,corn,buckwheat,chickpea,almond,coconut,cassava,gluten free,tamari,rice',
);

function contains(tokens: string[], list: string[][]): boolean {
  for (const w of list) {
    for (let i = 0; i + w.length <= tokens.length; i++) {
      let ok = true;
      for (let j = 0; j < w.length && ok; j++) ok = tokens[i + j] === w[j];
      if (ok) return true;
    }
  }
  return false;
}
const tokensOf = (name: string) => tokenize(name).map(singularize);

export function isMeatOrFish(name: string): boolean {
  const t = tokensOf(name);
  return contains(t, MEAT) && !contains(t, PLANT_MARKS);
}

export function isAnimalProduct(name: string): boolean {
  const t = tokensOf(name);
  if (contains(t, MEAT) && !contains(t, PLANT_MARKS)) return true;
  return contains(t, ANIMAL) && !contains(t, PLANT_MARKS);
}

export function containsGluten(name: string): boolean {
  const t = tokensOf(name);
  return contains(t, GLUTEN) && !contains(t, GLUTEN_FREE_MARKS);
}

/** Diet labels of a recipe from its ingredient names ([] when it has no ingredients). */
export function dietTags(ingredientNames: string[]): DietTag[] {
  const names = ingredientNames.filter((n) => n.trim());
  if (!names.length) return [];
  const out: DietTag[] = [];
  const vegetarian = !names.some(isMeatOrFish);
  if (vegetarian) out.push('vegetarian');
  if (vegetarian && !names.some(isAnimalProduct)) out.push('vegan');
  if (!names.some(containsGluten)) out.push('glutenFree');
  return out;
}
