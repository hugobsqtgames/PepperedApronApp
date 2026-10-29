import { z } from 'zod';
import {
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
];

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
}
