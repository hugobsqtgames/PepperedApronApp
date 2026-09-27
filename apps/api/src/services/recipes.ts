import { and, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7, type SyncRecord } from '@pepperedapron/core';
import type { AppDeps } from '../context';
import type { DbOrTx } from '../db';
import { recipes, uploads, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { loadChildren, replaceChildren } from '../sync/recipes';
import { nextVersion } from '../sync/version';

export type RecipeRow = typeof recipes.$inferSelect;

export interface FullRecipe {
  id: string;
  title: string;
  description: string | null;
  photoKey: string | null;
  photoUrl: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  totalMinutes: number | null;
  servings: number;
  yieldLabel: string | null;
  difficulty: string | null;
  seasons: string[];
  category: string | null;
  ovenTemperatureC: number | null;
  ovenMode: string | null;
  notes: string | null;
  tips: string | null;
  extraInfo: string | null;
  source: string | null;
  sourceUrl: string | null;
  tags: string[];
  visibility: string;
  ingredients: unknown[];
  steps: unknown[];
  author: { id: string; displayName: string };
  saveCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

export class RecipeService {
  constructor(private readonly d: AppDeps) {}

  photoUrl(key: string | null): string | null {
    return key ? `${this.d.storage.publicBaseUrl()}/${key}` : null;
  }

  async full(db: DbOrTx, row: RecipeRow): Promise<FullRecipe> {
    const c = (await loadChildren(db, [row.id])).get(row.id)!;
    const author = await db.query.users.findFirst({
      where: eq(users.id, row.ownerId),
      columns: { id: true, displayName: true },
    });
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      photoKey: row.photoKey,
      photoUrl: this.photoUrl(row.photoKey),
      prepMinutes: row.prepMinutes,
      cookMinutes: row.cookMinutes,
      restMinutes: row.restMinutes,
      totalMinutes: row.totalMinutes,
      servings: row.servings,
      yieldLabel: row.yieldLabel,
      difficulty: row.difficulty,
      seasons: row.seasons,
      category: row.category,
      ovenTemperatureC: row.ovenTemperatureC,
      ovenMode: row.ovenMode,
      notes: row.notes,
      tips: row.tips,
      extraInfo: row.extraInfo,
      source: row.source,
      sourceUrl: row.sourceUrl,
      tags: row.tags,
      visibility: row.visibility,
      ingredients: c.ingredients,
      steps: c.steps,
      author: { id: author?.id ?? row.ownerId, displayName: author?.displayName ?? '' },
      saveCount: row.saveCount,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getLive(db: DbOrTx, id: string): Promise<RecipeRow | null> {
    const r = await db.query.recipes.findFirst({
      where: and(eq(recipes.id, id), isNull(recipes.deletedAt)),
    });
    return r ?? null;
  }

  /**
   * Copy a recipe into a user's library ("Ajouter à mes recettes"): new ids, private, its own
   * copy of the photo so the original can be deleted independently.
   */
  async copyToLibrary(sourceId: string, userId: string): Promise<SyncRecord> {
    return this.d.db.transaction(async (tx) => {
      const src = await this.getLive(tx, sourceId);
      if (!src) throw notFound('recipe_not_found');
      const c = (await loadChildren(tx, [src.id])).get(src.id)!;
      const id = uuidv7();
      let photoKey: string | null = null;
      if (src.photoKey) {
        const dest = `u/${userId}/${uuidv7()}.${src.photoKey.split('.').pop() ?? 'jpg'}`;
        if (await this.d.storage.copy(src.photoKey, dest)) {
          photoKey = dest;
          const head = await this.d.storage.head(dest);
          await tx.insert(uploads).values({
            ownerId: userId,
            key: dest,
            contentType: head?.contentType ?? 'image/jpeg',
            maxBytes: head?.size ?? 0,
            sizeBytes: head?.size ?? 0,
            status: 'ready',
          });
        }
      }
      const version = await nextVersion(tx);
      const now = new Date();
      const {
        id: _i,
        ownerId: _o,
        householdId: _h,
        version: _v,
        createdAt: _c,
        updatedAt: _u,
        deletedAt: _d,
        publishedAt: _p,
        saveCount: _s,
        ...rest
      } = src;
      const [row] = await tx
        .insert(recipes)
        .values({
          ...rest,
          id,
          ownerId: userId,
          householdId: null,
          version,
          createdAt: now,
          updatedAt: now,
          visibility: 'private',
          originRecipeId: src.id,
          photoKey,
          saveCount: 0,
          publishedAt: null,
        })
        .returning();
      await replaceChildren(tx, id, {
        ingredients: c.ingredients.map((i) => ({ ...i, id: uuidv7() })),
        steps: c.steps.map((s) => ({ ...s, id: uuidv7() })),
      });
      if (src.ownerId !== userId)
        await tx
          .update(recipes)
          .set({ saveCount: sql`${recipes.saveCount} + 1` })
          .where(eq(recipes.id, src.id));
      const cc = (await loadChildren(tx, [id])).get(id)!;
      const { id: rid, ownerId, version: rv, updatedAt, ...data } = row!;
      void data;
      return {
        entity: 'recipe',
        id: rid,
        version: rv,
        ownerId,
        deleted: false,
        updatedAt: updatedAt.toISOString(),
        data: {
          title: row!.title,
          description: row!.description,
          photoKey: row!.photoKey,
          prepMinutes: row!.prepMinutes,
          cookMinutes: row!.cookMinutes,
          restMinutes: row!.restMinutes,
          totalMinutes: row!.totalMinutes,
          servings: row!.servings,
          yieldLabel: row!.yieldLabel,
          difficulty: row!.difficulty,
          seasons: row!.seasons,
          category: row!.category,
          ovenTemperatureC: row!.ovenTemperatureC,
          ovenMode: row!.ovenMode,
          notes: row!.notes,
          tips: row!.tips,
          extraInfo: row!.extraInfo,
          source: row!.source,
          sourceUrl: row!.sourceUrl,
          tags: row!.tags,
          visibility: row!.visibility,
          ingredients: cc.ingredients,
          steps: cc.steps,
          originRecipeId: row!.originRecipeId,
          householdId: null,
        },
      } satisfies SyncRecord;
    });
  }
}
