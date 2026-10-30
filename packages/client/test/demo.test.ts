/**
 * Demo data for the App Store review (docs/store/demo-backup.json): a filled library, a planned
 * week, a shopping list. Regenerate before a submission so the planning is on the current week:
 *   WRITE_DEMO=1 pnpm --filter @pepperedapron/client test demo
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addDays, parseIngredientLine, startOfWeek, toIsoDate, uuidv7 } from '@pepperedapron/core';
import { emptyRecipe, exportData, importData, LocalStore, Repos } from '../src';
import { betterSqliteDriver } from './betterSqliteDriver';

const FILE = path.resolve(__dirname, '../../../docs/store/demo-backup.json');

type R = [string, string, number, 'easy' | 'medium', number, number, string[], string[], string[]];
const RECIPES: R[] = [
  [
    'Velouté de potimarron',
    'soup',
    4,
    'easy',
    15,
    30,
    ['autumn', 'winter'],
    [
      '1,2 kg de potimarron',
      '2 oignons',
      '1 gousse d’ail',
      '80 cl de bouillon de légumes',
      '20 cl de crème fraîche',
      '1 c. à soupe d’huile d’olive',
    ],
    [
      'Couper le potimarron en cubes.',
      'Faire revenir les oignons et l’ail dans l’huile 5 min.',
      'Ajouter le potimarron et le bouillon, cuire 25 min.',
      'Mixer avec la crème.',
    ],
  ],
  [
    'Pâtes crémeuses au citron',
    'pasta',
    4,
    'easy',
    5,
    12,
    [],
    [
      '400 g de spaghetti',
      '2 citrons non traités',
      '20 cl de crème fraîche',
      '60 g de parmesan râpé',
      '1 gousse d’ail',
    ],
    [
      'Cuire les spaghetti 8 min dans l’eau bouillante salée.',
      'Chauffer la crème avec le zeste et le jus des citrons.',
      'Mélanger avec les pâtes et le parmesan.',
    ],
  ],
  [
    'Poulet rapide au citron',
    'main',
    4,
    'easy',
    10,
    15,
    [],
    ['4 filets de poulet', '1 citron', '2 c. à soupe d’huile d’olive', '1 c. à café de thym'],
    [
      'Couper le poulet en lanières.',
      'Saisir 8 min à feu vif.',
      'Arroser de citron, parsemer de thym.',
    ],
  ],
  [
    'Salade de lentilles',
    'salad',
    4,
    'easy',
    15,
    20,
    [],
    ['300 g de lentilles vertes', '1 échalote', '2 carottes', '3 c. à soupe de vinaigrette'],
    [
      'Cuire les lentilles 20 min.',
      'Couper les carottes et l’échalote.',
      'Mélanger tiède avec la vinaigrette.',
    ],
  ],
  [
    'Saumon rôti, légumes croquants',
    'fish',
    4,
    'easy',
    10,
    15,
    [],
    ['4 pavés de saumon', '2 courgettes', '1 poivron', '2 c. à soupe d’huile d’olive'],
    ['Préchauffer le four à 200 °C.', 'Rôtir légumes et saumon 15 min.'],
  ],
  [
    'Pain perdu brioché',
    'breakfast',
    2,
    'easy',
    5,
    10,
    [],
    ['4 tranches de brioche', '2 œufs', '20 cl de lait', '1 c. à soupe de sucre'],
    ['Battre œufs, lait et sucre.', 'Tremper la brioche et dorer 3 min par face.'],
  ],
  [
    'Crêpes de mamie',
    'dessert',
    6,
    'easy',
    10,
    20,
    [],
    ['250 g de farine', '4 œufs', '50 cl de lait', '1 pincée de sel', '30 g de beurre fondu'],
    [
      'Mélanger farine, œufs et sel.',
      'Ajouter le lait petit à petit, puis le beurre.',
      'Laisser reposer 1 h.',
      'Cuire les crêpes à la poêle.',
    ],
  ],
  [
    'Ratatouille',
    'vegetarian',
    6,
    'medium',
    25,
    45,
    ['summer'],
    [
      '2 aubergines',
      '3 courgettes',
      '2 poivrons',
      '6 tomates',
      '2 oignons',
      '3 c. à soupe d’huile d’olive',
    ],
    ['Couper tous les légumes.', 'Cuire chaque légume séparément.', 'Réunir et mijoter 30 min.'],
  ],
  [
    'Tarte aux pommes',
    'baking',
    8,
    'medium',
    20,
    35,
    ['autumn'],
    ['1 pâte brisée', '5 pommes', '30 g de beurre', '2 c. à soupe de sucre'],
    [
      'Étaler la pâte dans un moule de 24 cm.',
      'Disposer les pommes en rosace.',
      'Cuire 35 min à 180 °C.',
    ],
  ],
  [
    'Curry de pois chiches',
    'vegetarian',
    4,
    'easy',
    10,
    20,
    [],
    [
      '2 boîtes de pois chiches',
      '40 cl de lait de coco',
      '1 oignon',
      '2 c. à soupe de pâte de curry',
      '200 g d’épinards',
    ],
    [
      'Faire revenir l’oignon et le curry.',
      'Ajouter pois chiches et lait de coco, cuire 15 min.',
      'Ajouter les épinards en fin de cuisson.',
    ],
  ],
  [
    'Gratin dauphinois',
    'side',
    6,
    'medium',
    20,
    60,
    ['winter'],
    ['1,5 kg de pommes de terre', '50 cl de crème', '50 cl de lait', '2 gousses d’ail'],
    [
      'Trancher finement les pommes de terre.',
      'Chauffer crème, lait et ail.',
      'Cuire 1 h à 160 °C.',
    ],
  ],
  [
    'Smoothie banane-fraise',
    'drinks',
    2,
    'easy',
    5,
    0,
    ['spring', 'summer'],
    ['2 bananes', '200 g de fraises', '25 cl de lait'],
    ['Tout mixer.'],
  ],
];

async function build() {
  const store = await LocalStore.open(betterSqliteDriver());
  const repos = new Repos(store);
  const ids: string[] = [];
  for (const [title, category, servings, difficulty, prep, cook, seasons, ings, steps] of RECIPES) {
    const r = await repos.createRecipe({
      ...emptyRecipe(servings),
      title,
      category: category as never,
      difficulty,
      prepMinutes: prep,
      cookMinutes: cook || null,
      seasons: seasons as never,
      ingredients: ings.map((l) => ({
        id: uuidv7(),
        group: null,
        ...parseIngredientLine(l)!,
      })),
      steps: steps.map((text) => ({
        id: uuidv7(),
        group: null,
        text,
        timerSeconds: null,
        timerLabel: null,
      })),
    });
    ids.push(r.id);
  }
  for (const i of [0, 1, 6, 7]) await repos.toggleFavorite(ids[i]!);
  const quick = await repos.createCollection('Rapide', '⚡');
  for (const i of [1, 2, 5, 11]) await repos.setInCollection(quick.id, ids[i]!, true);
  const sweet = await repos.createCollection('Desserts', '🍰');
  for (const i of [6, 8]) await repos.setInCollection(sweet.id, ids[i]!, true);
  await repos.setRating(ids[0]!, 5);
  await repos.setRating(ids[6]!, 5);
  await repos.setPersonalNote(ids[0]!, 'Une pointe de muscade, et un peu moins de crème.');
  const ws = startOfWeek(toIsoDate(new Date()));
  const plan: [number, 'breakfast' | 'lunch' | 'dinner', number][] = [
    [0, 'lunch', 3],
    [0, 'dinner', 1],
    [1, 'breakfast', 5],
    [1, 'dinner', 0],
    [2, 'dinner', 4],
    [3, 'lunch', 9],
    [3, 'dinner', 2],
    [4, 'dinner', 7],
    [5, 'breakfast', 6],
    [6, 'dinner', 10],
  ];
  for (const [d, slot, i] of plan)
    await repos.planMeal({ date: addDays(ws, d), slot, recipeId: ids[i]! });
  await repos.logCooked(ids[0]!, addDays(ws, -10));
  await repos.logCooked(ids[6]!, addDays(ws, -90));
  const list = await repos.createList('Courses de la semaine');
  await repos.addPlanToList(list.id, ws, addDays(ws, 6));
  return { store, repos };
}

describe('demo data for the App Store review', () => {
  it('is valid, imports into an empty app and fills every screen', async () => {
    if (process.env.WRITE_DEMO) {
      const { store } = await build();
      // Settings stay the reviewer's own (language, first name…).
      const data = await exportData(store);
      data.records = data.records.filter((r) => r.entity !== 'settings');
      fs.writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
    }
    const fresh = await LocalStore.open(betterSqliteDriver());
    const repos = new Repos(fresh);
    expect(await importData(fresh, fs.readFileSync(FILE, 'utf8'))).toBeGreaterThan(40);
    expect(repos.recipes()).toHaveLength(RECIPES.length);
    expect(repos.favoriteRecipes()).toHaveLength(4);
    expect(repos.collections()).toHaveLength(2);
    expect(repos.lists()[0]!.data.name).toBe('Courses de la semaine');
    expect(repos.items(repos.lists()[0]!.id).length).toBeGreaterThan(10);
  });
});
