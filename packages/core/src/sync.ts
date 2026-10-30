import { z } from 'zod';
import {
  cookLogDataSchema,
  planTemplateDataSchema,
  priceDataSchema,
  pantryItemDataSchema,
  collectionDataSchema,
  collectionItemDataSchema,
  favoriteDataSchema,
  mealPlanEntryDataSchema,
  recipeDataSchema,
  settingsDataSchema,
  shoppingCategoryDataSchema,
  shoppingItemDataSchema,
  shoppingListDataSchema,
} from './schemas';
import { smartCollectionDataSchema, type SmartCollectionData } from './smart';

export const SYNC_ENTITIES = [
  'recipe',
  'favorite',
  'collection',
  'collectionItem',
  'mealPlanEntry',
  'shoppingList',
  'shoppingItem',
  'shoppingCategory',
  'settings',
  'cookLog',
  'planTemplate',
  'price',
  'pantryItem',
  'smartCollection',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** Validation schema of the full data payload for each entity. */
export const ENTITY_SCHEMAS: Record<SyncEntity, z.ZodType<Record<string, unknown>>> = {
  recipe: recipeDataSchema,
  favorite: favoriteDataSchema,
  collection: collectionDataSchema,
  collectionItem: collectionItemDataSchema,
  mealPlanEntry: mealPlanEntryDataSchema as unknown as z.ZodType<Record<string, unknown>>,
  shoppingList: shoppingListDataSchema,
  shoppingItem: shoppingItemDataSchema,
  shoppingCategory: shoppingCategoryDataSchema,
  settings: settingsDataSchema,
  cookLog: cookLogDataSchema,
  planTemplate: planTemplateDataSchema,
  price: priceDataSchema,
  pantryItem: pantryItemDataSchema,
  smartCollection: smartCollectionDataSchema,
};

/** Order in which entities are applied when merging (parents before children). */
export const ENTITY_ORDER: SyncEntity[] = [
  'settings',
  'recipe',
  'collection',
  'shoppingList',
  'shoppingCategory',
  'favorite',
  'collectionItem',
  'mealPlanEntry',
  'shoppingItem',
  'cookLog',
  'planTemplate',
  'price',
  'pantryItem',
  'smartCollection',
];

/**
 * Records that only make sense with their parent: when the parent is deleted on one device while
 * another device adds a child (favorites a recipe, ticks an item of a list…), the child is
 * removed after the merge, the same way on every device.
 */
export const ENTITY_PARENTS: Partial<Record<SyncEntity, [field: string, parent: SyncEntity][]>> = {
  favorite: [['recipeId', 'recipe']],
  collectionItem: [
    ['recipeId', 'recipe'],
    ['collectionId', 'collection'],
  ],
  cookLog: [['recipeId', 'recipe']],
  shoppingItem: [['listId', 'shoppingList']],
};

/** Top-level fields that differ between two versions of a record. */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): string[] {
  if (!before) return Object.keys(after);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

import type {
  CookLogData,
  PlanTemplateData,
  PriceData,
  PantryItemData,
  CollectionData,
  CollectionItemData,
  FavoriteData,
  MealPlanEntryData,
  RecipeData,
  SettingsData,
  ShoppingCategoryData,
  ShoppingItemData,
  ShoppingListData,
} from './schemas';

export interface EntityDataMap {
  recipe: RecipeData;
  favorite: FavoriteData;
  collection: CollectionData;
  collectionItem: CollectionItemData;
  mealPlanEntry: MealPlanEntryData;
  shoppingList: ShoppingListData;
  shoppingItem: ShoppingItemData;
  shoppingCategory: ShoppingCategoryData;
  settings: SettingsData;
  cookLog: CookLogData;
  planTemplate: PlanTemplateData;
  price: PriceData;
  pantryItem: PantryItemData;
  smartCollection: SmartCollectionData;
}

/**
 * Version of the data format. Bumped when records gain fields, so devices re-read the files of
 * the other devices once after an update (a file read by an older version may have had records
 * it could not understand yet).
 */
export const DATA_VERSION = 4;
