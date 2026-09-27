import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { authIdentities, favorites, householdMembers, recipes, users } from '../db/schema';

export async function householdOf(db: DbOrTx, userId: string): Promise<string | null> {
  const m = await db
    .select({ h: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return m[0]?.h ?? null;
}

export interface Scope {
  userId: string;
  householdId: string | null;
}

export async function scopeOf(db: DbOrTx, userId: string): Promise<Scope> {
  return { userId, householdId: await householdOf(db, userId) };
}

/** Row is private to the user or shared with the user's household. */
export function canAccess(
  scope: Scope,
  row: { ownerId: string; householdId: string | null },
): boolean {
  return (
    row.ownerId === scope.userId ||
    (scope.householdId !== null && row.householdId === scope.householdId)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function visibleWhere(scope: Scope, t: { ownerId: any; householdId: any }): SQL {
  return scope.householdId
    ? or(eq(t.ownerId, scope.userId), eq(t.householdId, scope.householdId))!
    : eq(t.ownerId, scope.userId);
}

/** A recipe the user can reference (favorite / plan / collection): own, household, or public. */
export async function canReferenceRecipe(
  db: DbOrTx,
  scope: Scope,
  recipeId: string,
): Promise<boolean> {
  const r = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(
      and(
        eq(recipes.id, recipeId),
        isNull(recipes.deletedAt),
        or(visibleWhere(scope, recipes), eq(recipes.visibility, 'public')),
      ),
    )
    .limit(1);
  return r.length > 0;
}

/** Recipe ids of public recipes favourited by the user (pulled read-only). */
export async function favoritedRecipeIds(db: DbOrTx, userId: string): Promise<string[]> {
  const r = await db
    .select({ id: favorites.recipeId })
    .from(favorites)
    .where(and(eq(favorites.ownerId, userId), isNull(favorites.deletedAt)));
  return r.map((x) => x.id);
}

export async function mayPublish(db: DbOrTx, userId: string): Promise<boolean> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u || !u.canPublish) return false;
  if (u.emailVerifiedAt) return true;
  const ids = await db
    .select({ id: authIdentities.id })
    .from(authIdentities)
    .where(eq(authIdentities.userId, userId))
    .limit(1);
  return ids.length > 0;
}

export async function bumpScopeEpoch(db: DbOrTx, userIds: string[]) {
  if (!userIds.length) return;
  await db
    .update(users)
    .set({ scopeEpoch: sql`${users.scopeEpoch} + 1` })
    .where(inArray(users.id, userIds));
}
