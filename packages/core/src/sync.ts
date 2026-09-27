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

/** Order in which entities must be applied (parents before children). */
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

export const syncOpSchema = z
  .object({
    opId: z.uuid(),
    entity: z.enum(SYNC_ENTITIES),
    id: z.uuid(),
    op: z.enum(['upsert', 'delete']),
    /** Server version the client based its change on; null for a creation. */
    baseVersion: z.number().int().min(0).nullable(),
    /** Fields changed by the client; null means "all fields" (creation or full replace). */
    changedFields: z.array(z.string().max(60)).max(60).nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
export type SyncOp = z.infer<typeof syncOpSchema>;

export const pushRequestSchema = z.object({ ops: z.array(syncOpSchema).min(1).max(200) }).strict();

export type PushStatus = 'applied' | 'merged' | 'duplicate' | 'gone' | 'rejected' | 'forbidden';

export interface SyncRecord {
  entity: SyncEntity;
  id: string;
  version: number;
  ownerId: string;
  deleted: boolean;
  updatedAt: string;
  data: Record<string, unknown> | null;
}

export interface PushResult {
  opId: string;
  status: PushStatus;
  /** Server state after the operation (absent when rejected/forbidden). */
  record?: SyncRecord;
  error?: string;
}

export interface PushResponse {
  results: PushResult[];
  scopeEpoch: number;
}

export interface PullResponse {
  records: SyncRecord[];
  cursor: number;
  hasMore: boolean;
  scopeEpoch: number;
}

/**
 * Field-level merge used when the client's base version is stale: only the fields the client
 * actually changed are applied on top of the current server state ("last writer wins per field").
 */
export function mergeChangedFields(
  server: Record<string, unknown>,
  client: Record<string, unknown>,
  changedFields: string[] | null,
): Record<string, unknown> {
  if (changedFields === null) return { ...server, ...client };
  const out = { ...server };
  for (const f of changedFields)
    if (Object.prototype.hasOwnProperty.call(client, f)) out[f] = client[f];
  return out;
}

/** Compute the list of top-level fields that differ (used by the client to build ops). */
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
