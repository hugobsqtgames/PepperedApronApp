import { asc, eq, inArray } from 'drizzle-orm';
import type { Ingredient, Step } from '@pepperedapron/core';
import type { DbOrTx } from '../db';
import { recipeIngredients, recipeSteps } from '../db/schema';

export interface RecipeChildren {
  ingredients: Ingredient[];
  steps: Step[];
}

export async function loadChildren(db: DbOrTx, recipeIds: string[]): Promise<Map<string, RecipeChildren>> {
  const out = new Map<string, RecipeChildren>();
  for (const id of recipeIds) out.set(id, { ingredients: [], steps: [] });
  if (!recipeIds.length) return out;
  const ings = await db.select().from(recipeIngredients).where(inArray(recipeIngredients.recipeId, recipeIds)).orderBy(asc(recipeIngredients.position));
  const stps = await db.select().from(recipeSteps).where(inArray(recipeSteps.recipeId, recipeIds)).orderBy(asc(recipeSteps.position));
  for (const i of ings) {
    out.get(i.recipeId)!.ingredients.push({ id: i.id, group: i.groupName, name: i.name, quantity: i.quantity, quantityMax: i.quantityMax, unit: i.unit, note: i.note });
  }
  for (const s of stps) {
    out.get(s.recipeId)!.steps.push({ id: s.id, group: s.groupName, text: s.text, timerSeconds: s.timerSeconds, timerLabel: s.timerLabel });
  }
  return out;
}

export async function replaceChildren(tx: DbOrTx, recipeId: string, c: RecipeChildren) {
  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId));
  // Child ids are client-generated; re-key duplicates within the same recipe defensively.
  const seen = new Set<string>();
  const fresh = (id: string) => (seen.has(id) ? crypto.randomUUID() : (seen.add(id), id));
  if (c.ingredients.length) {
    await tx.insert(recipeIngredients).values(
      c.ingredients.map((i, position) => ({ id: fresh(i.id), recipeId, position, groupName: i.group, name: i.name, quantity: i.quantity, quantityMax: i.quantityMax, unit: i.unit, note: i.note })),
    );
  }
  if (c.steps.length) {
    await tx.insert(recipeSteps).values(
      c.steps.map((s, position) => ({ id: fresh(s.id), recipeId, position, groupName: s.group, text: s.text, timerSeconds: s.timerSeconds, timerLabel: s.timerLabel })),
    );
  }
}
