import { singularize, tokenize } from './text';
import { getUnit, resolveUnit } from './units';

/**
 * Calorie estimate of a recipe, computed on the device from the ingredient list: nothing is
 * stored on the recipe (older versions would reject an unknown synced field), nothing is sent.
 * Values are average kcal per 100 g (French Ciqual / USDA tables, rounded), with what is needed
 * to turn "2 œufs" or "3 c. à soupe d'huile" into grams. It is an estimate: the screen says so
 * and lists what it could not count.
 */

interface Food {
  /** kcal per 100 g. */
  kcal: number;
  /** Grams of one piece ("2 oignons"). */
  piece?: number;
  /** Grams per ml, for volumes (1 when absent). */
  density?: number;
  /** Grams of one packet / sachet. */
  pack?: number;
  /** Grams of one slice. */
  slice?: number;
  /** Grams in one can, and kcal per 100 g when canned (cooked pulses). */
  can?: number;
  canKcal?: number;
  /** Too little to matter (salt, spices, herbs, water): counts as 0 kcal, never as "unknown". */
  negligible?: boolean;
  /** What it is when counted without a unit ("2 peppers" are bell peppers, not black pepper). */
  counted?: Food;
}

const N: Food = { kcal: 0, negligible: true };
const BELL_PEPPER: Food = { kcal: 30, piece: 150 };

/** Names (French and English, any form; plural and accents do not matter) → food. */
const FOODS: [string[], Food][] = [
  // Eggs and dairy
  [['oeuf', 'egg'], { kcal: 145, piece: 50 }],
  [['jaune oeuf', 'egg yolk'], { kcal: 320, piece: 18 }],
  [['blanc oeuf', 'egg white'], { kcal: 48, piece: 32 }],
  [['lait', 'milk', 'lait demi ecreme'], { kcal: 46, density: 1.03 }],
  [['lait entier', 'whole milk'], { kcal: 64, density: 1.03 }],
  [['lait ecreme', 'skim milk', 'skimmed milk'], { kcal: 34, density: 1.03 }],
  [['lait coco', 'coconut milk'], { kcal: 190, can: 400 }],
  [['creme coco', 'coconut cream'], { kcal: 230, can: 400 }],
  [
    ['lait concentre', 'condensed milk', 'lait concentre sucre'],
    { kcal: 320, density: 1.3, can: 397 },
  ],
  [
    [
      'lait vegetal',
      'lait avoine',
      'lait amande',
      'lait soja',
      'oat milk',
      'almond milk',
      'soy milk',
    ],
    { kcal: 40 },
  ],
  [
    [
      'creme',
      'creme fraiche',
      'sour cream',
      'creme epaisse',
      'creme liquide',
      'creme entiere',
      'heavy cream',
      'whipping cream',
      'cream',
      'double cream',
      'creme fleurette',
    ],
    { kcal: 290 },
  ],
  [
    ['creme legere', 'creme fraiche legere', 'light cream', 'single cream', 'creme liquide legere'],
    { kcal: 120 },
  ],
  [['creme cuisine', 'creme soja', 'cooking cream'], { kcal: 150 }],
  [['mascarpone'], { kcal: 430 }],
  [['ricotta'], { kcal: 150 }],
  [['yaourt', 'yogourt', 'yogurt', 'yoghurt', 'yaourt nature'], { kcal: 60, piece: 125 }],
  [['yaourt grec', 'greek yogurt'], { kcal: 120, piece: 150 }],
  [['fromage blanc', 'faisselle', 'skyr', 'quark'], { kcal: 70 }],
  [
    [
      'beurre',
      'butter',
      'beurre doux',
      'beurre demi sel',
      'beurre sale',
      'beurre mou',
      'beurre fondu',
    ],
    { kcal: 745, density: 0.95 },
  ],
  [['fromage', 'cheese'], { kcal: 350, slice: 25 }],
  [
    ['fromage rape', 'grated cheese', 'shredded cheese', 'emmental rape', 'gruyere rape'],
    { kcal: 390, density: 0.4 },
  ],
  [
    ['emmental', 'gruyere', 'comte', 'beaufort', 'cheddar', 'gouda', 'swiss cheese'],
    { kcal: 395, slice: 25, density: 0.4 },
  ],
  [['parmesan', 'parmigiano', 'pecorino', 'grana padano'], { kcal: 400, density: 0.4 }],
  [['mozzarella', 'burrata'], { kcal: 250, piece: 125 }],
  [['feta'], { kcal: 265, piece: 200 }],
  [['chevre', 'goat cheese', 'buche chevre'], { kcal: 300, slice: 20 }],
  [['camembert', 'brie', 'coulommiers'], { kcal: 300, piece: 250 }],
  [['reblochon'], { kcal: 330, piece: 450 }],
  [['raclette'], { kcal: 350, slice: 30 }],
  [['roquefort', 'bleu', 'gorgonzola', 'blue cheese'], { kcal: 360 }],
  [
    ['fromage frais', 'cream cheese', 'philadelphia', 'saint moret', 'carre frais', 'kiri'],
    { kcal: 250 },
  ],
  // Fats
  [
    [
      'huile',
      'oil',
      'olive oil',
      'huile olive',
      'huile tournesol',
      'huile colza',
      'huile neutre',
      'vegetable oil',
    ],
    { kcal: 900, density: 0.92 },
  ],
  [['margarine'], { kcal: 720 }],
  [['mayonnaise', 'mayo'], { kcal: 700 }],
  // Grains, bread, pastry
  [
    ['farine', 'flour', 'farine ble', 'all purpose flour', 'farine t55', 'farine t45'],
    { kcal: 350, density: 0.55 },
  ],
  [
    ['farine complete', 'whole wheat flour', 'farine sarrasin', 'farine riz'],
    { kcal: 340, density: 0.55 },
  ],
  [
    ['maizena', 'fecule', 'fecule mais', 'cornstarch', 'corn starch', 'cornflour'],
    { kcal: 360, density: 0.6 },
  ],
  [['semoule', 'couscous'], { kcal: 360, density: 0.75 }],
  [
    ['riz', 'rice', 'riz basmati', 'riz rond', 'riz arborio', 'riz thai'],
    { kcal: 355, density: 0.85 },
  ],
  [
    [
      'pate',
      'pasta',
      'spaghetti',
      'penne',
      'tagliatelle',
      'fusilli',
      'macaroni',
      'linguine',
      'coquillette',
      'farfalle',
      'rigatoni',
      'lasagne',
      'conchiglie',
    ],
    { kcal: 355, pack: 500 },
  ],
  [['pate fraiche', 'fresh pasta', 'ravioli'], { kcal: 280, pack: 250 }],
  [['nouille', 'noodle', 'vermicelle', 'ramen', 'udon', 'soba'], { kcal: 360, pack: 250 }],
  [['gnocchi'], { kcal: 150, pack: 500 }],
  [['quinoa'], { kcal: 370, density: 0.85 }],
  [['boulgour', 'bulgur', 'ebly', 'ble'], { kcal: 345, density: 0.8 }],
  [['polenta'], { kcal: 360, density: 0.8 }],
  [
    ['flocon avoine', 'avoine', 'oats', 'rolled oats', 'oatmeal', 'porridge'],
    { kcal: 370, density: 0.4 },
  ],
  [
    ['lentille', 'lentil', 'lentille corail', 'red lentil'],
    { kcal: 330, density: 0.85, can: 400, canKcal: 110 },
  ],
  [['pois chiche', 'chickpea', 'garbanzo'], { kcal: 340, density: 0.8, can: 400, canKcal: 120 }],
  [
    [
      'haricot rouge',
      'kidney bean',
      'haricot blanc',
      'white bean',
      'black bean',
      'haricot noir',
      'flageolet',
    ],
    { kcal: 330, density: 0.8, can: 400, canKcal: 110 },
  ],
  [['pain', 'bread', 'baguette', 'pain campagne'], { kcal: 270, piece: 250, slice: 30 }],
  [['pain mie', 'sandwich bread', 'toast bread'], { kcal: 265, slice: 25 }],
  [['pain burger', 'burger bun', 'bun', 'pain hamburger'], { kcal: 280, piece: 70 }],
  [['pain pita', 'pita', 'tortilla', 'wrap', 'galette ble'], { kcal: 300, piece: 60 }],
  [['chapelure', 'breadcrumb', 'panko'], { kcal: 380, density: 0.45 }],
  [['pate feuilletee', 'puff pastry'], { kcal: 400, piece: 230 }],
  [['pate brisee', 'shortcrust', 'pie crust', 'pie dough'], { kcal: 420, piece: 230 }],
  [['pate sablee', 'sweet pastry'], { kcal: 470, piece: 230 }],
  [['pate pizza', 'pizza dough'], { kcal: 260, piece: 400 }],
  [['pate filo', 'feuille brick', 'filo', 'phyllo'], { kcal: 300, piece: 10 }],
  [['biscuit', 'cookie', 'petit beurre', 'speculoos', 'sable'], { kcal: 470, piece: 8 }],
  [['boudoir', 'biscuit cuillere', 'ladyfinger', 'savoiardi'], { kcal: 390, piece: 6 }],
  [['corn flake', 'cereale', 'cereal', 'granola', 'muesli'], { kcal: 390, density: 0.35 }],
  // Sugar, sweet things
  [
    ['sucre', 'sugar', 'sucre poudre', 'sucre semoule', 'caster sugar', 'granulated sugar'],
    { kcal: 400, density: 0.85 },
  ],
  [
    ['sucre glace', 'icing sugar', 'powdered sugar', 'confectioner sugar'],
    { kcal: 400, density: 0.55 },
  ],
  [
    [
      'cassonade',
      'sucre roux',
      'sucre complet',
      'vergeoise',
      'brown sugar',
      'sucre canne',
      'muscovado',
    ],
    { kcal: 390, density: 0.8 },
  ],
  [['sucre vanille', 'sucre vanilline', 'vanilla sugar'], { kcal: 400, pack: 7.5 }],
  [['miel', 'honey'], { kcal: 320, density: 1.4 }],
  [
    ['sirop erable', 'maple syrup', 'sirop agave', 'agave', 'golden syrup', 'sirop'],
    { kcal: 270, density: 1.3 },
  ],
  [
    [
      'chocolat',
      'chocolate',
      'chocolat noir',
      'dark chocolate',
      'chocolat patissier',
      'chocolat dessert',
    ],
    { kcal: 550, piece: 10, pack: 200 },
  ],
  [
    ['chocolat lait', 'milk chocolate', 'chocolat blanc', 'white chocolate'],
    { kcal: 545, piece: 10, pack: 100 },
  ],
  [['pepite chocolat', 'chocolate chip', 'chips chocolat'], { kcal: 500, density: 0.6 }],
  [['cacao', 'cocoa', 'cacao poudre', 'cocoa powder', 'cacao amer'], { kcal: 380, density: 0.45 }],
  [['confiture', 'jam', 'gelee', 'marmelade'], { kcal: 250, density: 1.3 }],
  [['pate tartiner', 'nutella', 'chocolate spread'], { kcal: 540, density: 1.2 }],
  [['caramel', 'dulce leche', 'caramel beurre sale'], { kcal: 380, density: 1.2 }],
  [['compote', 'applesauce', 'puree pomme'], { kcal: 70, piece: 100 }],
  [
    ['levure', 'baking powder', 'yeast', 'levure chimique', 'levure boulanger', 'poudre lever'],
    { kcal: 100, pack: 11 },
  ],
  [['gelatine', 'gelatin', 'agar', 'agar agar'], N],
  // Nuts, seeds, dried fruit
  [['amande', 'almond'], { kcal: 600, density: 0.6, piece: 1.2 }],
  [
    ['poudre amande', 'amande poudre', 'ground almond', 'almond flour', 'almond meal'],
    { kcal: 600, density: 0.45 },
  ],
  [['noisette', 'hazelnut', 'poudre noisette'], { kcal: 630, density: 0.55, piece: 1.5 }],
  [
    ['noix', 'walnut', 'cerneau noix', 'noix pecan', 'pecan'],
    { kcal: 680, density: 0.45, piece: 5 },
  ],
  [['noix cajou', 'cashew'], { kcal: 580, density: 0.55, piece: 1.5 }],
  [['pistache', 'pistachio'], { kcal: 570, density: 0.55, piece: 0.7 }],
  [['cacahuete', 'arachide', 'peanut'], { kcal: 570, density: 0.6, piece: 0.8 }],
  [['beurre cacahuete', 'peanut butter', 'puree cacahuete'], { kcal: 600, density: 1.1 }],
  [['pignon', 'pine nut'], { kcal: 680, density: 0.6 }],
  [
    [
      'noix coco rapee',
      'coco rapee',
      'noix coco',
      'desiccated coconut',
      'shredded coconut',
      'coconut',
    ],
    { kcal: 650, density: 0.35 },
  ],
  [
    [
      'sesame',
      'graine sesame',
      'sesame seed',
      'graine chia',
      'chia',
      'graine lin',
      'flax',
      'graine courge',
      'graine tournesol',
    ],
    { kcal: 550, density: 0.6 },
  ],
  [['tahini', 'tahin', 'puree sesame'], { kcal: 600, density: 1.1 }],
  [
    ['raisin sec', 'raisin', 'sultana', 'cranberries sechee', 'dried cranberry'],
    { kcal: 300, density: 0.65 },
  ],
  [['datte', 'date', 'medjool'], { kcal: 280, piece: 8 }],
  [
    ['abricot sec', 'dried apricot', 'pruneau', 'figue seche', 'dried fig'],
    { kcal: 240, piece: 8 },
  ],
  // Meat, fish
  [['poulet', 'chicken', 'volaille'], { kcal: 165, piece: 1300 }],
  [
    [
      'blanc poulet',
      'filet poulet',
      'escalope poulet',
      'chicken breast',
      'escalope dinde',
      'blanc dinde',
      'filet dinde',
      'dinde',
      'turkey',
    ],
    { kcal: 110, piece: 140 },
  ],
  [
    ['cuisse poulet', 'haut cuisse', 'chicken thigh', 'pilon', 'drumstick', 'chicken leg'],
    { kcal: 200, piece: 150 },
  ],
  [['aiguillette poulet', 'chicken tender'], { kcal: 110, piece: 30 }],
  [
    [
      'boeuf',
      'beef',
      'steak',
      'bavette',
      'entrecote',
      'rumsteak',
      'faux filet',
      'paleron',
      'bourguignon',
      'joue boeuf',
      'roti boeuf',
    ],
    { kcal: 200, piece: 180 },
  ],
  [
    ['viande hachee', 'steak hache', 'boeuf hache', 'ground beef', 'minced beef', 'mince', 'hache'],
    { kcal: 220, piece: 125 },
  ],
  [
    ['porc', 'pork', 'cote porc', 'filet mignon', 'echine', 'roti porc', 'pork chop'],
    { kcal: 220, piece: 150 },
  ],
  [['lardon', 'bacon', 'pancetta', 'poitrine fumee'], { kcal: 300, slice: 15 }],
  [['jambon', 'ham', 'jambon blanc'], { kcal: 115, slice: 40 }],
  [
    [
      'jambon cru',
      'prosciutto',
      'jambon serrano',
      'jambon parme',
      'jambon bayonne',
      'coppa',
      'bresaola',
    ],
    { kcal: 250, slice: 15 },
  ],
  [
    ['saucisse', 'sausage', 'chipolata', 'merguez', 'saucisse toulouse', 'knack'],
    { kcal: 280, piece: 70 },
  ],
  [['chorizo', 'salami', 'pepperoni', 'saucisson'], { kcal: 450, slice: 3 }],
  [['agneau', 'lamb', 'gigot', 'souris agneau'], { kcal: 250, piece: 200 }],
  [['veau', 'veal', 'blanquette'], { kcal: 160, piece: 150 }],
  [['canard', 'duck'], { kcal: 200, piece: 200 }],
  [['magret', 'duck breast', 'magret canard'], { kcal: 330, piece: 350 }],
  [
    ['saumon', 'salmon', 'pave saumon', 'filet saumon', 'truite', 'trout'],
    { kcal: 200, piece: 130 },
  ],
  [['saumon fume', 'smoked salmon', 'truite fumee'], { kcal: 180, slice: 25 }],
  [['thon', 'tuna', 'thon naturel'], { kcal: 120, can: 140, piece: 140 }],
  [
    [
      'cabillaud',
      'cod',
      'colin',
      'merlu',
      'lieu',
      'poisson blanc',
      'white fish',
      'poisson',
      'fish',
      'dorade',
      'bar',
      'sole',
      'haddock',
    ],
    { kcal: 90, piece: 130 },
  ],
  [['sardine', 'maquereau', 'mackerel'], { kcal: 200, piece: 40, can: 115 }],
  [
    [
      'crevette',
      'shrimp',
      'prawn',
      'gambas',
      'saint jacques',
      'scallop',
      'calamar',
      'squid',
      'encornet',
    ],
    { kcal: 90, piece: 15 },
  ],
  [['moule', 'mussel', 'palourde', 'clam'], { kcal: 85, piece: 10 }],
  [['anchois', 'anchovy'], { kcal: 200, piece: 4 }],
  [['tofu', 'tofu ferme', 'tofu soyeux', 'silken tofu'], { kcal: 120, pack: 400 }],
  [['tempeh', 'seitan'], { kcal: 190, pack: 200 }],
  // Vegetables
  [['pomme terre', 'potato', 'patate', 'grenaille'], { kcal: 80, piece: 150 }],
  [['patate douce', 'sweet potato'], { kcal: 86, piece: 250 }],
  [['carotte', 'carrot'], { kcal: 40, piece: 100 }],
  [
    [
      'oignon',
      'onion',
      'oignon rouge',
      'red onion',
      'oignon jaune',
      'cebette',
      'oignon nouveau',
      'spring onion',
      'green onion',
      'scallion',
    ],
    { kcal: 40, piece: 100 },
  ],
  [['echalote', 'shallot'], { kcal: 70, piece: 30 }],
  [['ail', 'garlic', 'gousse ail', 'garlic clove'], { kcal: 130, piece: 5 }],
  [['poireau', 'leek'], { kcal: 30, piece: 150 }],
  [['courgette', 'zucchini', 'courgettes'], { kcal: 17, piece: 200 }],
  [['aubergine', 'eggplant'], { kcal: 25, piece: 250 }],
  [['poivron', 'bell pepper', 'poivron rouge', 'poivron vert', 'poivron jaune'], BELL_PEPPER],
  [['tomate', 'tomato', 'tomates'], { kcal: 18, piece: 120 }],
  [['tomate cerise', 'cherry tomato', 'tomate cocktail'], { kcal: 20, piece: 15 }],
  [
    [
      'tomate pelee',
      'canned tomato',
      'tomate concassee',
      'chopped tomato',
      'tomate boite',
      'pulpe tomate',
      'tomates pelees',
    ],
    { kcal: 25, can: 400 },
  ],
  [
    ['coulis tomate', 'sauce tomate', 'passata', 'tomato sauce', 'puree tomate', 'tomato puree'],
    { kcal: 35, density: 1.03, can: 400 },
  ],
  [['concentre tomate', 'tomato paste', 'double concentre'], { kcal: 80, density: 1.1, can: 140 }],
  [['tomate sechee', 'sun dried tomato'], { kcal: 250, piece: 5 }],
  [
    ['champignon', 'mushroom', 'champignon paris', 'cepe', 'girolle', 'shiitake', 'pleurote'],
    { kcal: 22, piece: 20, can: 230 },
  ],
  [['epinard', 'spinach', 'pousse epinard', 'baby spinach'], { kcal: 23, density: 0.15 }],
  [
    ['salade', 'laitue', 'lettuce', 'roquette', 'arugula', 'rocket', 'mache', 'mesclun', 'batavia'],
    { kcal: 15, piece: 300, density: 0.1 },
  ],
  [['concombre', 'cucumber'], { kcal: 15, piece: 300 }],
  [['brocoli', 'broccoli'], { kcal: 34, piece: 350 }],
  [['chou fleur', 'cauliflower'], { kcal: 25, piece: 800 }],
  [
    [
      'chou',
      'cabbage',
      'chou rouge',
      'chou blanc',
      'chou kale',
      'kale',
      'chou chinois',
      'pak choi',
      'bok choy',
    ],
    { kcal: 28, piece: 800 },
  ],
  [['chou bruxelles', 'brussels sprout'], { kcal: 43, piece: 12 }],
  [['haricot vert', 'green bean'], { kcal: 31, density: 0.5 }],
  [['petit pois', 'pea', 'peas', 'edamame'], { kcal: 80, density: 0.6, can: 280 }],
  [['mais', 'corn', 'sweetcorn', 'sweet corn'], { kcal: 90, density: 0.7, can: 285 }],
  [['avocat', 'avocado'], { kcal: 160, piece: 150 }],
  [
    [
      'potiron',
      'citrouille',
      'pumpkin',
      'courge',
      'squash',
      'potimarron',
      'butternut',
      'courge butternut',
    ],
    { kcal: 30, piece: 1200 },
  ],
  [['navet', 'turnip', 'panais', 'parsnip', 'rutabaga'], { kcal: 35, piece: 150 }],
  [['betterave', 'beetroot', 'beet'], { kcal: 45, piece: 150 }],
  [['celeri', 'celery', 'celeri branche'], { kcal: 16, piece: 40 }],
  [['celeri rave', 'celeriac'], { kcal: 30, piece: 700 }],
  [['fenouil', 'fennel'], { kcal: 30, piece: 250 }],
  [['asperge', 'asparagus'], { kcal: 20, piece: 20 }],
  [['artichaut', 'artichoke'], { kcal: 50, piece: 300 }],
  [['radis', 'radish'], { kcal: 16, piece: 10 }],
  [['endive', 'chicory'], { kcal: 17, piece: 120 }],
  [['olive', 'olive noire', 'olive verte', 'black olive', 'green olive'], { kcal: 145, piece: 4 }],
  [['cornichon', 'pickle', 'gherkin', 'capre', 'caper'], { kcal: 15, piece: 10 }],
  [['gingembre', 'ginger'], { kcal: 80, piece: 20 }],
  // Fruit
  [['pomme', 'apple'], { kcal: 52, piece: 150 }],
  [['poire', 'pear'], { kcal: 57, piece: 170 }],
  [['banane', 'banana'], { kcal: 90, piece: 120 }],
  [['citron', 'lemon', 'citron jaune'], { kcal: 30, piece: 100 }],
  [['citron vert', 'lime'], { kcal: 30, piece: 60 }],
  [['jus citron', 'lemon juice', 'jus citron vert', 'lime juice'], { kcal: 22 }],
  [['orange', 'clementine', 'mandarine', 'pamplemousse', 'grapefruit'], { kcal: 47, piece: 180 }],
  [['jus orange', 'orange juice', 'jus pomme', 'apple juice', 'jus fruit'], { kcal: 45 }],
  [['fraise', 'strawberry'], { kcal: 32, piece: 15 }],
  [
    [
      'framboise',
      'raspberry',
      'myrtille',
      'blueberry',
      'mure',
      'blackberry',
      'fruit rouge',
      'berries',
      'cassis',
      'groseille',
    ],
    { kcal: 50, piece: 3, density: 0.6 },
  ],
  [['mangue', 'mango'], { kcal: 60, piece: 300 }],
  [['ananas', 'pineapple'], { kcal: 50, piece: 900, can: 340 }],
  [['peche', 'peach', 'nectarine', 'brugnon'], { kcal: 39, piece: 150 }],
  [['abricot', 'apricot'], { kcal: 48, piece: 40 }],
  [['cerise', 'cherry'], { kcal: 63, piece: 8 }],
  [['raisin frais', 'grape'], { kcal: 70, piece: 5 }],
  [['kiwi'], { kcal: 61, piece: 75 }],
  [['figue', 'fig'], { kcal: 74, piece: 50 }],
  [['prune', 'plum', 'quetsche', 'mirabelle'], { kcal: 46, piece: 30 }],
  [['melon', 'pasteque', 'watermelon'], { kcal: 35, piece: 1000 }],
  [['grenade', 'pomegranate'], { kcal: 83, piece: 250 }],
  // Sauces, drinks, condiments
  [['moutarde', 'mustard'], { kcal: 150, density: 1.05 }],
  [['ketchup'], { kcal: 110, density: 1.15 }],
  [['pesto'], { kcal: 450, density: 1 }],
  [['sauce soja', 'soy sauce', 'tamari', 'shoyu'], { kcal: 60, density: 1.1 }],
  [
    ['sauce huitre', 'oyster sauce', 'sauce hoisin', 'hoisin', 'sauce teriyaki', 'teriyaki'],
    { kcal: 150, density: 1.2 },
  ],
  [['pate curry', 'curry paste'], { kcal: 120, density: 1 }],
  [
    ['vin', 'wine', 'vin blanc', 'vin rouge', 'white wine', 'red wine', 'cidre', 'cider'],
    { kcal: 80 },
  ],
  [['biere', 'beer'], { kcal: 43 }],
  [
    [
      'rhum',
      'rum',
      'cognac',
      'whisky',
      'grand marnier',
      'cointreau',
      'vodka',
      'brandy',
      'amaretto',
      'calvados',
      'porto',
      'marsala',
    ],
    { kcal: 230 },
  ],
  [['cafe', 'coffee', 'espresso', 'the', 'tea'], N],
  // Next to nothing
  [['sel', 'salt', 'fleur sel', 'gros sel', 'sel poivre'], N],
  [['poivre', 'black pepper', 'poivre noir'], N],
  [['pepper'], { ...N, counted: BELL_PEPPER }],
  [['eau', 'water', 'glacon', 'ice', 'ice cube', 'eau tiede', 'eau chaude', 'eau froide'], N],
  [['bouillon', 'broth', 'stock', 'cube bouillon', 'bouillon cube', 'fond veau', 'fumet'], N],
  [['vinaigre', 'vinegar', 'vinaigre balsamique', 'balsamic'], N],
  [
    [
      'epice',
      'spice',
      'cumin',
      'curry',
      'paprika',
      'cannelle',
      'cinnamon',
      'muscade',
      'nutmeg',
      'curcuma',
      'turmeric',
      'piment',
      'chili',
      'piment espelette',
      'cayenne',
      'ras hanout',
      'garam masala',
      'quatre epice',
      'coriandre moulue',
      'clou girofle',
      'clove',
      'cardamome',
      'cardamom',
      'badiane',
      'anis',
      'safran',
      'saffron',
      'herbe provence',
      'zaatar',
      'sumac',
      'fenugrec',
    ],
    N,
  ],
  [
    [
      'persil',
      'parsley',
      'coriandre',
      'coriander',
      'cilantro',
      'basilic',
      'basil',
      'ciboulette',
      'chive',
      'menthe',
      'mint',
      'aneth',
      'dill',
      'estragon',
      'tarragon',
      'cerfeuil',
      'thym',
      'thyme',
      'romarin',
      'rosemary',
      'laurier',
      'bay leaf',
      'origan',
      'oregano',
      'sauge',
      'sage',
      'herbe',
      'herb',
      'citronnelle',
      'lemongrass',
    ],
    N,
  ],
  [
    [
      'vanille',
      'vanilla',
      'gousse vanille',
      'extrait vanille',
      'vanilla extract',
      'arome',
      'extract',
      'eau fleur oranger',
      'zeste',
      'zest',
      'colorant',
      'food coloring',
    ],
    N,
  ],
  [
    [
      'bicarbonate',
      'baking soda',
      'sauce worcestershire',
      'worcestershire',
      'tabasco',
      'sriracha',
      'harissa',
      'nuoc mam',
      'fish sauce',
      'sauce poisson',
    ],
    N,
  ],
];

const STOP = new Set([
  'd',
  'de',
  'du',
  'des',
  'l',
  'la',
  'le',
  'les',
  'a',
  'au',
  'aux',
  'en',
  'of',
  'the',
  'et',
  'and',
  'un',
  'une',
]);
// "chiches" and "chiche" singularize differently ("chich", "chiche"): the final e is dropped too.
const stem = (w: string) => {
  const s = singularize(w);
  return s.length > 3 && s.endsWith('e') ? s.slice(0, -1) : s;
};
const words = (s: string) =>
  tokenize(s)
    .filter((w) => !STOP.has(w))
    .map(stem);

const DICT = FOODS.flatMap(([names, food]) => names.map((n) => ({ tokens: words(n), food })));

function findSeq(hay: string[], needle: string[]): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** The food an ingredient name refers to: longest name found in it, the earliest on a tie. */
export function findFood(name: string): Food | null {
  const toks = words(name);
  let best: { food: Food; len: number; at: number } | null = null;
  for (const e of DICT) {
    if (!e.tokens.length) continue;
    const at = findSeq(toks, e.tokens);
    if (at < 0) continue;
    if (!best || e.tokens.length > best.len || (e.tokens.length === best.len && at < best.at))
      best = { food: e.food, len: e.tokens.length, at };
  }
  return best?.food ?? null;
}

interface IngredientLike {
  name: string;
  quantity: number | null;
  quantityMax?: number | null;
  unit: string | null;
}

/** kcal of one ingredient line, 0 for salt, water or herbs, null when it cannot be told. */
export function ingredientCalories(i: IngredientLike): number | null {
  // "3 pots de farine": the yogurt pot (125 ml) of the French yogurt cake.
  const pot = /^\s*pots?\s+(?:de\s+|d['’]\s*)/i.exec(i.name);
  let food = findFood(pot ? i.name.slice(pot[0].length) : i.name);
  if (!food) return null;
  if (food.counted && i.quantity !== null && !i.unit) food = food.counted;
  if (food.negligible) return 0;
  if (i.quantity === null) return null;
  const q = i.quantityMax ? (i.quantity + i.quantityMax) / 2 : i.quantity;
  if (pot && !i.unit) return (q * 125 * (food.density ?? 1) * food.kcal) / 100;
  const unit = i.unit ? (getUnit(i.unit) ?? resolveUnit(i.unit)) : undefined;
  if (i.unit && !unit) return null;
  let grams: number | null;
  let kcal = food.kcal;
  if (!unit) grams = food.piece ? q * food.piece : null;
  else if (unit.dimension === 'mass') grams = q * unit.toBase;
  else if (unit.dimension === 'volume') grams = q * unit.toBase * (food.density ?? 1);
  else
    switch (unit.key) {
      case 'piece':
        grams = food.piece ? q * food.piece : null;
        break;
      case 'pinch':
      case 'drop':
      case 'leaf':
      case 'sprig':
        grams = q * 0.5;
        break;
      case 'clove':
        grams = q * (food.piece && food.piece <= 10 ? food.piece : 5);
        break;
      case 'slice':
        grams = q * (food.slice ?? 25);
        break;
      case 'can':
        grams = q * (food.can ?? 400);
        if (food.canKcal) kcal = food.canKcal;
        break;
      case 'packet':
        grams = food.pack ? q * food.pack : null;
        break;
      case 'handful':
        grams = q * 30;
        break;
      case 'bunch':
        grams = q * 50;
        break;
      default:
        grams = null;
    }
  return grams === null ? null : (grams * kcal) / 100;
}

export interface CalorieEstimate {
  /** Whole recipe, kcal. */
  total: number;
  /** One serving, rounded to 10 kcal. */
  perServing: number;
  /** Ingredients that could not be counted (unknown food or quantity). */
  missing: string[];
  /** Share of the ingredients that matter which were counted, 0 to 1. */
  coverage: number;
}

/**
 * Estimate for a recipe; null when too much of it is unknown to give a fair number (less than 3
 * ingredients out of 4 counted) or when the result is not believable.
 */
export function estimateCalories(r: {
  ingredients: IngredientLike[];
  servings: number;
}): CalorieEstimate | null {
  let total = 0;
  let counted = 0;
  let relevant = 0;
  const missing: string[] = [];
  for (const i of r.ingredients) {
    const kcal = ingredientCalories(i);
    if (kcal === 0) continue;
    relevant++;
    if (kcal === null) missing.push(i.name);
    else {
      counted++;
      total += kcal;
    }
  }
  if (!counted || r.servings < 1) return null;
  const coverage = counted / relevant;
  if (coverage < 0.75) return null;
  const perServing = Math.round(total / r.servings / 10) * 10;
  if (perServing < 10 || perServing > 5000) return null;
  return { total: Math.round(total), perServing, missing, coverage };
}
