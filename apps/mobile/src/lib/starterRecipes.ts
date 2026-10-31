import { parseRecipeText, type RecipeCategory } from '@pepperedapron/core';
import { recipeFromDraft, type Repos } from '@pepperedapron/client';

/**
 * Ten classics offered on the first launch (and later from Settings › My data), so the app is
 * never empty. Written as plain recipe text and read by the app's own parser, like an import.
 */
interface Starter {
  category: RecipeCategory;
  seasons?: ('spring' | 'summer' | 'autumn' | 'winter')[];
  text: string;
}

const FR: Starter[] = [
  {
    category: 'breakfast',
    text: `Crêpes
Pour 4 personnes
Préparation : 10 min
Cuisson : 20 min
Repos : 30 min
Ingrédients :
- 250 g de farine
- 4 œufs
- 50 cl de lait
- 50 g de beurre fondu
- 1 pincée de sel
- 1 c. à soupe de sucre
Préparation :
1. Mélanger la farine, le sel et le sucre, creuser un puits et y casser les œufs.
2. Verser le lait petit à petit en fouettant pour éviter les grumeaux, puis ajouter le beurre fondu.
3. Laisser reposer la pâte 30 min.
4. Cuire les crêpes dans une poêle chaude légèrement beurrée, 1 min de chaque côté.`,
  },
  {
    category: 'pasta',
    text: `Spaghetti bolognaise
Pour 4 personnes
Préparation : 15 min
Cuisson : 45 min
Ingrédients :
- 400 g de spaghetti
- 400 g de bœuf haché
- 1 oignon
- 1 carotte
- 2 gousses d'ail
- 400 g de tomates concassées
- 2 c. à soupe de concentré de tomate
- 2 c. à soupe d'huile d'olive
- 50 g de parmesan
Préparation :
1. Hacher l'oignon, la carotte et l'ail, puis les faire revenir 5 min dans l'huile d'olive.
2. Ajouter le bœuf haché et le faire dorer en l'émiettant.
3. Ajouter les tomates et le concentré, saler, poivrer et laisser mijoter 35 min à feu doux.
4. Cuire les spaghetti 10 min dans l'eau bouillante salée, égoutter et servir avec la sauce et le parmesan.`,
  },
  {
    category: 'side',
    seasons: ['autumn', 'winter'],
    text: `Gratin dauphinois
Pour 6 personnes
Préparation : 20 min
Cuisson : 1 h
Four : 160 °C
Ingrédients :
- 1,2 kg de pommes de terre
- 50 cl de crème liquide
- 25 cl de lait
- 2 gousses d'ail
- 1 pincée de muscade
- 20 g de beurre
Préparation :
1. Préchauffer le four à 160 °C et frotter un plat avec l'ail puis le beurrer.
2. Éplucher les pommes de terre et les couper en fines rondelles.
3. Chauffer le lait et la crème avec l'ail écrasé, la muscade, du sel et du poivre.
4. Disposer les pommes de terre dans le plat, couvrir du mélange et enfourner 1 h.`,
  },
  {
    category: 'main',
    text: `Quiche lorraine
Pour 6 personnes
Préparation : 15 min
Cuisson : 35 min
Four : 180 °C
Ingrédients :
- 1 pâte brisée
- 200 g de lardons
- 3 œufs
- 20 cl de crème fraîche
- 20 cl de lait
- 1 pincée de muscade
Préparation :
1. Préchauffer le four à 180 °C et étaler la pâte dans un moule à tarte.
2. Faire dorer les lardons à la poêle sans matière grasse, puis les répartir sur la pâte.
3. Battre les œufs avec la crème, le lait, la muscade et un peu de poivre.
4. Verser sur les lardons et enfourner 35 min, jusqu'à ce que la quiche soit dorée.`,
  },
  {
    category: 'baking',
    text: `Gâteau au yaourt
Pour 8 personnes
Préparation : 10 min
Cuisson : 35 min
Four : 180 °C
Ingrédients :
- 1 pot de yaourt nature
- 3 pots de farine
- 2 pots de sucre
- 1/2 pot d'huile
- 3 œufs
- 1 sachet de levure chimique
- 1 zeste de citron
Préparation :
1. Préchauffer le four à 180 °C et beurrer un moule.
2. Mélanger le yaourt et le sucre, puis ajouter les œufs un à un.
3. Incorporer la farine et la levure, puis l'huile et le zeste.
4. Verser dans le moule et cuire 35 min : la lame d'un couteau doit ressortir sèche.`,
  },
  {
    category: 'meat',
    text: `Poulet rôti au thym
Pour 4 personnes
Préparation : 10 min
Cuisson : 1 h 15
Four : 200 °C
Ingrédients :
- 1 poulet fermier
- 4 gousses d'ail
- 1 citron
- 4 branches de thym
- 30 g de beurre
- 1 kg de pommes de terre grenaille
Préparation :
1. Préchauffer le four à 200 °C.
2. Glisser le citron coupé en deux, l'ail et le thym dans le poulet, puis le badigeonner de beurre, saler et poivrer.
3. Le poser dans un plat entouré des pommes de terre et enfourner 1 h 15 en l'arrosant de temps en temps.
4. Laisser reposer 10 min avant de découper.`,
  },
  {
    category: 'vegetarian',
    seasons: ['summer'],
    text: `Ratatouille
Pour 4 personnes
Préparation : 20 min
Cuisson : 45 min
Ingrédients :
- 2 courgettes
- 1 aubergine
- 2 poivrons
- 4 tomates
- 1 oignon
- 2 gousses d'ail
- 4 c. à soupe d'huile d'olive
- 2 branches de thym
Préparation :
1. Couper tous les légumes en dés.
2. Faire revenir l'oignon et l'ail 5 min dans l'huile d'olive.
3. Ajouter les poivrons et l'aubergine et cuire 10 min, puis les courgettes et les tomates.
4. Ajouter le thym, saler, poivrer et laisser mijoter 30 min à couvert.`,
  },
  {
    category: 'soup',
    seasons: ['autumn', 'winter'],
    text: `Velouté de potiron
Pour 4 personnes
Préparation : 15 min
Cuisson : 25 min
Ingrédients :
- 1 kg de potiron
- 2 pommes de terre
- 1 oignon
- 1 l de bouillon de légumes
- 10 cl de crème liquide
- 1 c. à soupe d'huile d'olive
Préparation :
1. Éplucher et couper le potiron, les pommes de terre et l'oignon en morceaux.
2. Faire revenir l'oignon 3 min dans l'huile, puis ajouter les légumes et le bouillon.
3. Cuire 25 min à feu moyen.
4. Mixer avec la crème, saler, poivrer et servir bien chaud.`,
  },
  {
    category: 'salad',
    seasons: ['summer'],
    text: `Salade niçoise
Pour 4 personnes
Préparation : 20 min
Cuisson : 10 min
Ingrédients :
- 4 œufs
- 4 tomates
- 200 g de haricots verts
- 1 boîte de thon
- 1 poivron
- 12 olives noires
- 8 filets d'anchois
- 4 c. à soupe d'huile d'olive
- 1 c. à soupe de vinaigre
Préparation :
1. Cuire les œufs 9 min dans l'eau bouillante et les haricots verts 8 min, puis les refroidir.
2. Couper les tomates en quartiers et le poivron en lanières.
3. Disposer les légumes, le thon, les œufs écalés en quartiers, les olives et les anchois.
4. Arroser d'huile et de vinaigre, saler et poivrer.`,
  },
  {
    category: 'dessert',
    text: `Cookies aux pépites de chocolat
Pour 15 cookies
Préparation : 15 min
Cuisson : 10 min
Four : 180 °C
Ingrédients :
- 125 g de beurre mou
- 100 g de sucre roux
- 50 g de sucre
- 1 œuf
- 225 g de farine
- 1 c. à café de levure chimique
- 150 g de pépites de chocolat
- 1 pincée de sel
Préparation :
1. Préchauffer le four à 180 °C.
2. Mélanger le beurre et les sucres, puis ajouter l'œuf.
3. Incorporer la farine, la levure et le sel, puis les pépites de chocolat.
4. Former des boules sur une plaque et cuire 10 min : les cookies durcissent en refroidissant.`,
  },
];

const EN: Starter[] = [
  {
    category: 'breakfast',
    text: `Pancakes
Serves 4
Prep time: 10 min
Cook time: 20 min
Ingredients:
- 200 g flour
- 2 tsp baking powder
- 2 tbsp sugar
- 1 pinch salt
- 2 eggs
- 300 ml milk
- 30 g melted butter
Method:
1. Mix the flour, baking powder, sugar and salt.
2. Whisk in the eggs, the milk and the melted butter until smooth.
3. Cook ladlefuls in a hot buttered pan, 2 min on each side, until golden.`,
  },
  {
    category: 'pasta',
    text: `Spaghetti bolognese
Serves 4
Prep time: 15 min
Cook time: 45 min
Ingredients:
- 400 g spaghetti
- 400 g minced beef
- 1 onion
- 1 carrot
- 2 garlic cloves
- 400 g chopped tomatoes
- 2 tbsp tomato paste
- 2 tbsp olive oil
- 50 g parmesan
Method:
1. Chop the onion, carrot and garlic and soften them in the olive oil for 5 min.
2. Add the beef and brown it, breaking it up.
3. Add the tomatoes and tomato paste, season and simmer for 35 min over a low heat.
4. Cook the spaghetti for 10 min in boiling salted water, drain and serve with the sauce and parmesan.`,
  },
  {
    category: 'side',
    seasons: ['autumn', 'winter'],
    text: `Potato gratin
Serves 6
Prep time: 20 min
Cook time: 1 h
Oven: 160 °C
Ingredients:
- 1.2 kg potatoes
- 500 ml cream
- 250 ml milk
- 2 garlic cloves
- 1 pinch nutmeg
- 20 g butter
Method:
1. Preheat the oven to 160 °C, rub a dish with garlic and butter it.
2. Peel the potatoes and slice them thinly.
3. Heat the milk and cream with the crushed garlic, nutmeg, salt and pepper.
4. Layer the potatoes in the dish, pour the cream over and bake for 1 h.`,
  },
  {
    category: 'main',
    text: `Quiche lorraine
Serves 6
Prep time: 15 min
Cook time: 35 min
Oven: 180 °C
Ingredients:
- 1 shortcrust pastry
- 200 g bacon lardons
- 3 eggs
- 200 ml crème fraîche
- 200 ml milk
- 1 pinch nutmeg
Method:
1. Preheat the oven to 180 °C and line a tart tin with the pastry.
2. Fry the bacon until golden and spread it over the pastry.
3. Whisk the eggs with the crème fraîche, milk, nutmeg and pepper.
4. Pour over the bacon and bake for 35 min until golden.`,
  },
  {
    category: 'baking',
    text: `Banana bread
Serves 8
Prep time: 15 min
Cook time: 55 min
Oven: 175 °C
Ingredients:
- 3 ripe bananas
- 75 g melted butter
- 150 g sugar
- 1 egg
- 1 tsp baking soda
- 190 g flour
- 1 pinch salt
Method:
1. Preheat the oven to 175 °C and butter a loaf tin.
2. Mash the bananas and mix in the butter, sugar and egg.
3. Stir in the baking soda, salt and flour.
4. Pour into the tin and bake for 55 min, until a skewer comes out clean.`,
  },
  {
    category: 'meat',
    text: `Roast chicken with thyme
Serves 4
Prep time: 10 min
Cook time: 1 h 15
Oven: 200 °C
Ingredients:
- 1 whole chicken
- 4 garlic cloves
- 1 lemon
- 4 sprigs thyme
- 30 g butter
- 1 kg baby potatoes
Method:
1. Preheat the oven to 200 °C.
2. Put the halved lemon, garlic and thyme inside the chicken, rub it with butter and season.
3. Roast it surrounded by the potatoes for 1 h 15, basting from time to time.
4. Rest for 10 min before carving.`,
  },
  {
    category: 'vegetarian',
    seasons: ['summer'],
    text: `Ratatouille
Serves 4
Prep time: 20 min
Cook time: 45 min
Ingredients:
- 2 courgettes
- 1 aubergine
- 2 peppers
- 4 tomatoes
- 1 onion
- 2 garlic cloves
- 4 tbsp olive oil
- 2 sprigs thyme
Method:
1. Dice all the vegetables.
2. Soften the onion and garlic in the olive oil for 5 min.
3. Add the peppers and aubergine and cook for 10 min, then the courgettes and tomatoes.
4. Add the thyme, season and simmer, covered, for 30 min.`,
  },
  {
    category: 'soup',
    seasons: ['autumn', 'winter'],
    text: `Pumpkin soup
Serves 4
Prep time: 15 min
Cook time: 25 min
Ingredients:
- 1 kg pumpkin
- 2 potatoes
- 1 onion
- 1 l vegetable stock
- 100 ml cream
- 1 tbsp olive oil
Method:
1. Peel and chop the pumpkin, potatoes and onion.
2. Soften the onion in the oil for 3 min, then add the vegetables and stock.
3. Simmer for 25 min.
4. Blend with the cream, season and serve hot.`,
  },
  {
    category: 'salad',
    seasons: ['summer'],
    text: `Niçoise salad
Serves 4
Prep time: 20 min
Cook time: 10 min
Ingredients:
- 4 eggs
- 4 tomatoes
- 200 g green beans
- 1 can tuna
- 1 pepper
- 12 black olives
- 8 anchovy fillets
- 4 tbsp olive oil
- 1 tbsp vinegar
Method:
1. Boil the eggs for 9 min and the green beans for 8 min, then cool them.
2. Cut the tomatoes into wedges and the pepper into strips.
3. Arrange the vegetables, tuna, quartered eggs, olives and anchovies.
4. Dress with the oil and vinegar and season.`,
  },
  {
    category: 'dessert',
    text: `Chocolate chip cookies
Makes 15
Prep time: 15 min
Cook time: 10 min
Oven: 180 °C
Ingredients:
- 125 g soft butter
- 100 g brown sugar
- 50 g sugar
- 1 egg
- 225 g flour
- 1 tsp baking powder
- 150 g chocolate chips
- 1 pinch salt
Method:
1. Preheat the oven to 180 °C.
2. Cream the butter with the sugars, then beat in the egg.
3. Stir in the flour, baking powder and salt, then the chocolate chips.
4. Shape balls on a tray and bake for 10 min: the cookies firm up as they cool.`,
  },
];

export const STARTER_COUNT = FR.length;

/** The starter recipes in the app's language (titles already in the library are skipped). */
export async function addStarterRecipes(repos: Repos, language: string): Promise<number> {
  const list = language.startsWith('fr') ? FR : EN;
  const have = new Set(repos.recipes().map((r) => r.data.title.trim().toLowerCase()));
  let added = 0;
  for (const s of list) {
    const draft = parseRecipeText(s.text);
    const data = recipeFromDraft(draft, repos.settings().defaultServings);
    if (!data.title || have.has(data.title.toLowerCase())) continue;
    await repos.createRecipe({ ...data, category: s.category, seasons: s.seasons ?? [] });
    added++;
  }
  return added;
}
