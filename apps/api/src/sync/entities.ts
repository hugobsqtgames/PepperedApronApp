import type { SyncEntity } from '@pepperedapron/core';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  collectionItems,
  collections,
  favorites,
  mealPlanEntries,
  recipes,
  shoppingCategories,
  shoppingItems,
  shoppingLists,
  userSettings,
} from '../db/schema';

export const TABLES = {
  recipe: recipes,
  favorite: favorites,
  collection: collections,
  collectionItem: collectionItems,
  mealPlanEntry: mealPlanEntries,
  shoppingList: shoppingLists,
  shoppingItem: shoppingItems,
  shoppingCategory: shoppingCategories,
  settings: userSettings,
} satisfies Record<SyncEntity, PgTable>;

/** Data fields per entity (column property names are identical to the data field names). */
export const FIELDS: Record<SyncEntity, readonly string[]> = {
  recipe: [
    'title',
    'description',
    'photoKey',
    'prepMinutes',
    'cookMinutes',
    'restMinutes',
    'totalMinutes',
    'servings',
    'yieldLabel',
    'difficulty',
    'seasons',
    'category',
    'ovenTemperatureC',
    'ovenMode',
    'notes',
    'tips',
    'extraInfo',
    'source',
    'sourceUrl',
    'tags',
    'visibility',
    'ingredients',
    'steps',
    'originRecipeId',
    'householdId',
  ],
  favorite: ['recipeId', 'householdId'],
  collection: ['name', 'emoji', 'position', 'householdId'],
  collectionItem: ['collectionId', 'recipeId', 'position'],
  mealPlanEntry: ['date', 'slot', 'recipeId', 'customTitle', 'servings', 'position', 'householdId'],
  shoppingList: ['name', 'emoji', 'archived', 'householdId'],
  shoppingItem: [
    'listId',
    'name',
    'quantity',
    'unit',
    'categoryKey',
    'checked',
    'position',
    'note',
    'recipeIds',
  ],
  shoppingCategory: ['key', 'name', 'position', 'hidden'],
  settings: [],
};

/** Fields that only the owner of a row may change. */
export const OWNER_ONLY_FIELDS: Partial<Record<SyncEntity, string[]>> = {
  recipe: ['householdId', 'visibility'],
  collection: ['householdId'],
  shoppingList: ['householdId'],
  mealPlanEntry: ['householdId'],
  favorite: ['householdId'],
};

/** Fields that can never change after creation. */
export const IMMUTABLE_FIELDS: Partial<Record<SyncEntity, string[]>> = {
  favorite: ['recipeId'],
  collectionItem: ['collectionId', 'recipeId'],
  shoppingItem: ['listId'],
  shoppingCategory: ['key'],
  recipe: ['originRecipeId'],
};
