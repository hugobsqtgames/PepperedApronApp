import { and, asc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  collectionItemId,
  ENTITY_SCHEMAS,
  favoriteId,
  mergeChangedFields,
  SYNC_ENTITIES,
  type PullResponse,
  type PushResponse,
  type PushResult,
  type SyncEntity,
  type SyncOp,
  type SyncRecord,
} from '@pepperedapron/core';
import type { AppDeps } from '../context';
import type { DbOrTx, Tx } from '../db';
import {
  collectionItems,
  collections,
  deletedObjects,
  favorites,
  householdMembers,
  mealPlanEntries,
  recipes,
  shoppingItems,
  shoppingLists,
  syncOps,
  syncState,
  uploads,
  users,
} from '../db/schema';
import { FIELDS, IMMUTABLE_FIELDS, OWNER_ONLY_FIELDS, TABLES } from './entities';
import { loadChildren, replaceChildren } from './recipes';
import {
  bumpScopeEpoch,
  canAccess,
  canReferenceRecipe,
  favoritedRecipeIds,
  mayPublish,
  scopeOf,
  visibleWhere,
  type Scope,
} from './scope';
import { nextVersion, TOMBSTONE_HORIZON } from './version';

type Row = Record<string, unknown> & {
  id: string;
  ownerId: string;
  householdId: string | null;
  version: number;
  updatedAt: Date;
  deletedAt: Date | null;
};

class OpError extends Error {
  constructor(
    public readonly status: 'rejected' | 'forbidden' | 'gone',
    public readonly code: string,
  ) {
    super(code);
  }
}

// Drizzle's generic table typing does not allow dynamic tables; the registry is typed at the edges.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T = (e: SyncEntity) => TABLES[e] as any;

export class SyncService {
  constructor(private readonly d: AppDeps) {}

  private rowToData(
    entity: SyncEntity,
    row: Row,
    children?: { ingredients: unknown[]; steps: unknown[] },
  ): Record<string, unknown> {
    if (entity === 'settings') return { ...(row.data as Record<string, unknown>) };
    const out: Record<string, unknown> = {};
    for (const f of FIELDS[entity]) {
      if (f === 'ingredients' || f === 'steps') continue;
      out[f] = row[f] ?? null;
    }
    if (entity === 'recipe') {
      out.ingredients = children?.ingredients ?? [];
      out.steps = children?.steps ?? [];
    }
    return out;
  }

  private toRecord(entity: SyncEntity, row: Row, data: Record<string, unknown> | null): SyncRecord {
    return {
      entity,
      id: row.id,
      version: row.version,
      ownerId: row.ownerId,
      deleted: row.deletedAt !== null,
      updatedAt: row.updatedAt.toISOString(),
      data: row.deletedAt ? null : data,
    };
  }

  private async recordFor(db: DbOrTx, entity: SyncEntity, row: Row): Promise<SyncRecord> {
    if (entity === 'recipe' && !row.deletedAt) {
      const c = (await loadChildren(db, [row.id])).get(row.id)!;
      return this.toRecord(entity, row, this.rowToData(entity, row, c));
    }
    return this.toRecord(entity, row, row.deletedAt ? null : this.rowToData(entity, row));
  }

  // ------------------------------------------------------------------ push
  async push(userId: string, ops: SyncOp[]): Promise<PushResponse> {
    const results: PushResult[] = [];
    for (const op of ops) results.push(await this.applyOp(userId, op));
    const u = await this.d.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { scopeEpoch: true },
    });
    return { results, scopeEpoch: u?.scopeEpoch ?? 0 };
  }

  private async applyOp(userId: string, op: SyncOp): Promise<PushResult> {
    const done = await this.d.db.query.syncOps.findFirst({ where: eq(syncOps.opId, op.opId) });
    if (done) {
      if (done.userId !== userId)
        return { opId: op.opId, status: 'forbidden', error: 'op_id_reused' };
      return { ...(done.result as PushResult), status: 'duplicate' };
    }
    let result: PushResult;
    const run = () =>
      this.d.db.transaction(async (tx) => {
        const r = await this.applyInTx(tx, userId, op);
        await tx.insert(syncOps).values({ opId: op.opId, userId, result: r });
        return r;
      });
    const isUnique = (e: unknown) =>
      (e as { code?: string }).code === '23505' ||
      (e as { cause?: { code?: string } }).cause?.code === '23505';
    try {
      try {
        result = await run();
      } catch (e) {
        // Two devices created the same deterministic row concurrently: retry once as an update.
        if (!isUnique(e)) throw e;
        result = await run();
      }
    } catch (e) {
      if (e instanceof OpError) {
        result = { opId: op.opId, status: e.status, error: e.code };
        if (e.status === 'gone') {
          const row = await this.d.db
            .select()
            .from(T(op.entity))
            .where(eq(T(op.entity).id, op.id))
            .limit(1);
          const scope = await scopeOf(this.d.db, userId);
          if (row[0] && canAccess(scope, row[0] as Row))
            result.record = await this.recordFor(this.d.db, op.entity, row[0] as Row);
        }
      } else if (isUnique(e)) {
        result = { opId: op.opId, status: 'rejected', error: 'duplicate' };
      } else {
        throw e;
      }
    }
    return result;
  }

  private async applyInTx(tx: Tx, userId: string, op: SyncOp): Promise<PushResult> {
    const entity = op.entity;
    const table = T(entity);
    const scope = await scopeOf(tx, userId);
    const [existing] = (await tx
      .select()
      .from(table)
      .where(eq(table.id, op.id))
      .for('update')) as Row[];

    if (entity === 'settings' && op.id !== userId) throw new OpError('forbidden', 'forbidden');
    if (existing && !canAccess(scope, existing)) throw new OpError('forbidden', 'forbidden');
    if (existing?.deletedAt) throw new OpError('gone', 'deleted');

    if (op.op === 'delete') {
      if (!existing) throw new OpError('gone', 'not_found');
      if (entity === 'settings') throw new OpError('rejected', 'cannot_delete_settings');
      const version = await nextVersion(tx);
      const now = new Date();
      const [row] = (await tx
        .update(table)
        .set({ deletedAt: now, updatedAt: now, version })
        .where(eq(table.id, op.id))
        .returning()) as Row[];
      await this.cascadeDelete(tx, scope, entity, existing);
      return { opId: op.opId, status: 'applied', record: this.toRecord(entity, row!, null) };
    }

    if (!op.data) throw new OpError('rejected', 'missing_data');
    let current: Record<string, unknown> | null = null;
    if (existing) {
      const children =
        entity === 'recipe' ? (await loadChildren(tx, [existing.id])).get(existing.id) : undefined;
      current = this.rowToData(entity, existing, children);
    }
    const fields = entity === 'settings' ? null : FIELDS[entity];
    const clientData = fields
      ? Object.fromEntries(Object.entries(op.data).filter(([k]) => fields.includes(k)))
      : op.data;
    let merged: Record<string, unknown>;
    let status: PushResult['status'] = 'applied';
    if (!current) {
      merged = clientData;
    } else if (op.baseVersion === existing!.version) {
      merged = mergeChangedFields(current, clientData, op.changedFields);
    } else {
      // Stale base: never overwrite the whole row, apply only the client's changed fields.
      merged = mergeChangedFields(
        current,
        clientData,
        op.changedFields ??
          Object.keys(clientData).filter(
            (k) => JSON.stringify(clientData[k]) !== JSON.stringify(current![k]),
          ),
      );
      status = 'merged';
    }

    const parsed = ENTITY_SCHEMAS[entity].safeParse(merged);
    if (!parsed.success)
      throw new OpError(
        'rejected',
        `invalid:${parsed.error.issues
          .map((i) => i.path.join('.') || i.code)
          .slice(0, 5)
          .join(',')}`,
      );
    const data = parsed.data as Record<string, unknown>;

    const isOwner = !existing || existing.ownerId === userId;
    if (current) {
      for (const f of IMMUTABLE_FIELDS[entity] ?? []) {
        if (JSON.stringify(current[f]) !== JSON.stringify(data[f]))
          throw new OpError('rejected', `immutable:${f}`);
      }
      if (!isOwner) {
        for (const f of OWNER_ONLY_FIELDS[entity] ?? []) {
          if (JSON.stringify(current[f]) !== JSON.stringify(data[f]))
            throw new OpError('forbidden', `owner_only:${f}`);
        }
      }
    }

    const values = await this.authorizeAndPrepare(
      tx,
      scope,
      entity,
      op.id,
      data,
      current,
      existing ?? null,
    );
    const version = await nextVersion(tx);
    const now = new Date();
    const [row] = existing
      ? ((await tx
          .update(table)
          .set({ ...values.columns, version, updatedAt: now })
          .where(eq(table.id, op.id))
          .returning()) as Row[])
      : ((await tx
          .insert(table)
          .values({
            id: op.id,
            ownerId: values.ownerId,
            ...values.columns,
            version,
            createdAt: now,
            updatedAt: now,
          })
          .returning()) as Row[]);
    if (entity === 'recipe') {
      await replaceChildren(tx, op.id, {
        ingredients: data.ingredients as never,
        steps: data.steps as never,
      });
      if (current && current.photoKey && current.photoKey !== data.photoKey)
        await this.maybeDeleteObject(tx, String(current.photoKey));
    }
    if (
      existing &&
      current &&
      'householdId' in current &&
      current.householdId !== data.householdId
    ) {
      await this.onHouseholdChange(
        tx,
        entity,
        existing,
        (data.householdId as string | null) ?? null,
      );
    }
    const record = await this.recordFor(tx, entity, row!);
    return { opId: op.opId, status, record };
  }

  /** Entity-specific authorization; returns the column values to write. */
  private async authorizeAndPrepare(
    tx: Tx,
    scope: Scope,
    entity: SyncEntity,
    id: string,
    data: Record<string, unknown>,
    current: Record<string, unknown> | null,
    existing: Row | null,
  ): Promise<{ ownerId: string; columns: Record<string, unknown> }> {
    const uid = scope.userId;
    const ownerId = existing?.ownerId ?? uid;
    const householdChanged = !current || current.householdId !== data.householdId;
    if (
      'householdId' in data &&
      householdChanged &&
      data.householdId !== null &&
      data.householdId !== scope.householdId
    ) {
      throw new OpError('forbidden', 'not_household_member');
    }
    const cols: Record<string, unknown> = {};

    switch (entity) {
      case 'settings': {
        if (id !== uid) throw new OpError('forbidden', 'forbidden');
        return { ownerId: uid, columns: { data, householdId: null } };
      }
      case 'recipe': {
        if (
          data.visibility === 'public' &&
          current?.visibility !== 'public' &&
          !(await mayPublish(tx, uid))
        ) {
          throw new OpError('forbidden', 'publish_requires_verified_email');
        }
        if (data.photoKey && data.photoKey !== current?.photoKey) {
          const up = await tx.query.uploads.findFirst({
            where: and(
              eq(uploads.key, String(data.photoKey)),
              eq(uploads.ownerId, uid),
              eq(uploads.status, 'ready'),
            ),
          });
          if (!up) throw new OpError('forbidden', 'photo_not_owned');
        }
        if (
          !current &&
          data.originRecipeId &&
          !(await canReferenceRecipe(tx, scope, String(data.originRecipeId)))
        ) {
          data.originRecipeId = null;
        }
        for (const f of FIELDS.recipe) if (f !== 'ingredients' && f !== 'steps') cols[f] = data[f];
        if (data.visibility === 'public' && current?.visibility !== 'public')
          cols.publishedAt = new Date();
        if (data.visibility === 'private') cols.publishedAt = null;
        return { ownerId, columns: cols };
      }
      case 'favorite': {
        if (!existing && id !== favoriteId(uid, String(data.recipeId)))
          throw new OpError('rejected', 'invalid_id');
        if (!current && !(await canReferenceRecipe(tx, scope, String(data.recipeId))))
          throw new OpError('forbidden', 'recipe_not_accessible');
        return { ownerId, columns: { recipeId: data.recipeId, householdId: data.householdId } };
      }
      case 'collection':
      case 'shoppingList': {
        for (const f of FIELDS[entity]) cols[f] = data[f];
        return { ownerId, columns: cols };
      }
      case 'collectionItem': {
        const parent = await tx.query.collections.findFirst({
          where: and(eq(collections.id, String(data.collectionId)), isNull(collections.deletedAt)),
        });
        if (!parent || !canAccess(scope, parent))
          throw new OpError('forbidden', 'collection_not_accessible');
        if (!existing && id !== collectionItemId(String(data.collectionId), String(data.recipeId)))
          throw new OpError('rejected', 'invalid_id');
        if (!current && !(await canReferenceRecipe(tx, scope, String(data.recipeId))))
          throw new OpError('forbidden', 'recipe_not_accessible');
        return {
          ownerId: parent.ownerId,
          columns: {
            collectionId: data.collectionId,
            recipeId: data.recipeId,
            position: data.position,
            householdId: parent.householdId,
          },
        };
      }
      case 'mealPlanEntry': {
        if (
          data.recipeId &&
          data.recipeId !== current?.recipeId &&
          !(await canReferenceRecipe(tx, scope, String(data.recipeId)))
        ) {
          throw new OpError('forbidden', 'recipe_not_accessible');
        }
        for (const f of FIELDS.mealPlanEntry) cols[f] = data[f];
        return { ownerId, columns: cols };
      }
      case 'shoppingItem': {
        const list = await tx.query.shoppingLists.findFirst({
          where: and(eq(shoppingLists.id, String(data.listId)), isNull(shoppingLists.deletedAt)),
        });
        if (!list || !canAccess(scope, list)) throw new OpError('forbidden', 'list_not_accessible');
        for (const f of FIELDS.shoppingItem) cols[f] = data[f];
        cols.householdId = list.householdId;
        return { ownerId: list.ownerId, columns: cols };
      }
      case 'shoppingCategory': {
        if (existing && existing.ownerId !== uid) throw new OpError('forbidden', 'forbidden');
        for (const f of FIELDS.shoppingCategory) cols[f] = data[f];
        cols.householdId = null;
        return { ownerId: uid, columns: cols };
      }
    }
  }

  private async bumpRows(tx: Tx, entity: SyncEntity, ids: string[], set: Record<string, unknown>) {
    if (!ids.length) return;
    const version = await nextVersion(tx);
    await tx
      .update(T(entity))
      .set({ ...set, version, updatedAt: new Date() })
      .where(inArray(T(entity).id, ids));
  }

  private async cascadeDelete(tx: Tx, scope: Scope, entity: SyncEntity, row: Row) {
    const now = new Date();
    if (entity === 'shoppingList') {
      const items = await tx
        .select({ id: shoppingItems.id })
        .from(shoppingItems)
        .where(and(eq(shoppingItems.listId, row.id), isNull(shoppingItems.deletedAt)));
      await this.bumpRows(
        tx,
        'shoppingItem',
        items.map((i) => i.id),
        { deletedAt: now },
      );
    }
    if (entity === 'collection') {
      const items = await tx
        .select({ id: collectionItems.id })
        .from(collectionItems)
        .where(and(eq(collectionItems.collectionId, row.id), isNull(collectionItems.deletedAt)));
      await this.bumpRows(
        tx,
        'collectionItem',
        items.map((i) => i.id),
        { deletedAt: now },
      );
    }
    if (entity === 'recipe') {
      const favs = await tx
        .select({ id: favorites.id })
        .from(favorites)
        .where(
          and(
            eq(favorites.recipeId, row.id),
            isNull(favorites.deletedAt),
            visibleWhere(scope, favorites),
          ),
        );
      await this.bumpRows(
        tx,
        'favorite',
        favs.map((f) => f.id),
        { deletedAt: now },
      );
      const items = await tx
        .select({ id: collectionItems.id })
        .from(collectionItems)
        .where(
          and(
            eq(collectionItems.recipeId, row.id),
            isNull(collectionItems.deletedAt),
            visibleWhere(scope, collectionItems),
          ),
        );
      await this.bumpRows(
        tx,
        'collectionItem',
        items.map((i) => i.id),
        { deletedAt: now },
      );
      // Planned meals keep their slot, converted to a free-text meal.
      const plans = await tx
        .select({ id: mealPlanEntries.id })
        .from(mealPlanEntries)
        .where(
          and(
            eq(mealPlanEntries.recipeId, row.id),
            isNull(mealPlanEntries.deletedAt),
            visibleWhere(scope, mealPlanEntries),
          ),
        );
      await this.bumpRows(
        tx,
        'mealPlanEntry',
        plans.map((p) => p.id),
        { recipeId: null, customTitle: String(row.title).slice(0, 200) },
      );
      if (row.photoKey) await this.maybeDeleteObject(tx, String(row.photoKey));
    }
  }

  /** Queue a storage object for deletion if no live recipe still uses it (copies share photos). */
  async maybeDeleteObject(tx: DbOrTx, key: string) {
    const used = await tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.photoKey, key), isNull(recipes.deletedAt)))
      .limit(1);
    const avatar = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.avatarKey, key))
      .limit(1);
    if (!used.length && !avatar.length)
      await tx.insert(deletedObjects).values({ key }).onConflictDoNothing();
  }

  private async onHouseholdChange(
    tx: Tx,
    entity: SyncEntity,
    row: Row,
    newHousehold: string | null,
  ) {
    // Children follow their parent's sharing.
    if (entity === 'shoppingList') {
      const items = await tx
        .select({ id: shoppingItems.id })
        .from(shoppingItems)
        .where(and(eq(shoppingItems.listId, row.id), isNull(shoppingItems.deletedAt)));
      await this.bumpRows(
        tx,
        'shoppingItem',
        items.map((i) => i.id),
        { householdId: newHousehold },
      );
    }
    if (entity === 'collection') {
      const items = await tx
        .select({ id: collectionItems.id })
        .from(collectionItems)
        .where(and(eq(collectionItems.collectionId, row.id), isNull(collectionItems.deletedAt)));
      await this.bumpRows(
        tx,
        'collectionItem',
        items.map((i) => i.id),
        { householdId: newHousehold },
      );
    }
    // Members who lose access must purge their copy: full resync on their next pull.
    if (row.householdId && row.householdId !== newHousehold) {
      const members = await tx
        .select({ u: householdMembers.userId })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, row.householdId),
            ne(householdMembers.userId, row.ownerId),
          ),
        );
      await bumpScopeEpoch(
        tx,
        members.map((m) => m.u),
      );
    }
  }

  // ------------------------------------------------------------------ pull
  async pull(userId: string, cursor: number, limit = 500): Promise<PullResponse> {
    const db = this.d.db;
    return db.transaction(
      async (tx) => {
        const scope = await scopeOf(tx, userId);
        const u = await tx.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { scopeEpoch: true },
        });
        const horizon =
          (
            await tx.query.syncState.findFirst({
              where: eq(syncState.key, TOMBSTONE_HORIZON),
            })
          )?.value ?? 0;
        if (cursor > 0 && cursor < horizon) {
          return {
            records: [],
            cursor: 0,
            hasMore: true,
            scopeEpoch: u?.scopeEpoch ?? 0,
            resync: true,
          };
        }
        const favIds = await favoritedRecipeIds(tx, userId);
        const rows: { entity: SyncEntity; row: Row }[] = [];
        for (const entity of SYNC_ENTITIES) {
          const t = T(entity);
          let where = and(gt(t.version, cursor), visibleWhere(scope, t));
          if (entity === 'recipe' && favIds.length) {
            where = and(
              gt(t.version, cursor),
              sql`(${visibleWhere(scope, t)} OR ${inArray(t.id, favIds)})`,
            );
          }
          const r = (await tx
            .select()
            .from(t)
            .where(where)
            .orderBy(asc(t.version))
            .limit(limit + 1)) as Row[];
          for (const row of r) rows.push({ entity, row });
        }
        rows.sort((a, b) => a.row.version - b.row.version);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page.length ? page[page.length - 1]!.row.version : cursor;
        // On the last page every visible row up to this snapshot has been sent; versions commit in
        // order, so the cursor can safely move past the purge horizon (else it would loop on resync).
        const newCursor = hasMore ? last : Math.max(last, horizon);

        // Public recipes referenced by favorites in this page (favorited after their last change).
        const inPage = new Set(page.filter((p) => p.entity === 'recipe').map((p) => p.row.id));
        const extraIds = [
          ...new Set(
            page
              .filter((p) => p.entity === 'favorite' && !p.row.deletedAt)
              .map((p) => String(p.row.recipeId))
              .filter((id) => !inPage.has(id)),
          ),
        ];
        const extra = extraIds.length
          ? ((await tx
              .select()
              .from(recipes)
              .where(inArray(recipes.id, extraIds))) as unknown as Row[])
          : [];
        const recipeRows = [
          ...page.filter((p) => p.entity === 'recipe').map((p) => p.row),
          ...extra,
        ];
        const children = await loadChildren(
          tx,
          recipeRows.filter((r) => !r.deletedAt).map((r) => r.id),
        );

        const records: SyncRecord[] = [];
        const emitRecipe = (row: Row) => {
          const accessible =
            canAccess(scope, row) || (row.visibility === 'public' && !row.deletedAt);
          if (!accessible) {
            // No longer public: tell the client to drop its read-only copy.
            records.push({
              entity: 'recipe',
              id: row.id,
              version: row.version,
              ownerId: row.ownerId,
              deleted: true,
              updatedAt: row.updatedAt.toISOString(),
              data: null,
            });
            return;
          }
          records.push(
            this.toRecord(
              'recipe',
              row,
              row.deletedAt ? null : this.rowToData('recipe', row, children.get(row.id)),
            ),
          );
        };
        for (const { entity, row } of page) {
          if (entity === 'recipe') emitRecipe(row);
          else
            records.push(
              this.toRecord(entity, row, row.deletedAt ? null : this.rowToData(entity, row)),
            );
        }
        for (const row of extra) emitRecipe(row);
        return { records, cursor: newCursor, hasMore, scopeEpoch: u?.scopeEpoch ?? 0 };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
