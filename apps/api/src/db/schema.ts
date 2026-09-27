import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const now = (name: string) => ts(name).notNull().defaultNow();

/** Global, monotonically increasing version used by the sync protocol. */
export const syncVersionSeq = pgSequence('sync_version_seq', { startWith: 1 });

// ---------------------------------------------------------------- accounts
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerifiedAt: ts('email_verified_at'),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    avatarKey: text('avatar_key'),
    role: text('role').notNull().default('user'),
    locale: text('locale').notNull().default('fr'),
    /** Bumped when the set of data visible to the user changes (household join/leave). */
    scopeEpoch: integer('scope_epoch').notNull().default(0),
    canPublish: boolean('can_publish').notNull().default(true),
    createdAt: now('created_at'),
    updatedAt: now('updated_at'),
    lastSeenAt: ts('last_seen_at'),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
    check('users_role_ck', sql`${t.role} in ('user','admin')`),
  ],
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: now('created_at'),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_subject_uq').on(t.provider, t.subject),
    index('auth_identities_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshHash: text('refresh_hash').notNull(),
    previousHash: text('previous_hash'),
    deviceName: text('device_name'),
    platform: text('platform'),
    appVersion: text('app_version'),
    createdAt: now('created_at'),
    lastUsedAt: now('last_used_at'),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('sessions_refresh_uq').on(t.refreshHash),
    index('sessions_prev_idx').on(t.previousHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    newEmail: text('new_email'),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: now('created_at'),
  },
  (t) => [
    uniqueIndex('email_tokens_hash_uq').on(t.tokenHash),
    check(
      'email_tokens_kind_ck',
      sql`${t.kind} in ('verify_email','reset_password','change_email')`,
    ),
  ],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    createdAt: now('created_at'),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------- households
export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
});

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: now('joined_at'),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    // One household per user.
    uniqueIndex('household_members_user_uq').on(t.userId),
    check('household_members_role_ck', sql`${t.role} in ('owner','member')`),
  ],
);

export const householdInvites = pgTable(
  'household_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: ts('expires_at').notNull(),
    maxUses: integer('max_uses').notNull().default(5),
    uses: integer('uses').notNull().default(0),
    revokedAt: ts('revoked_at'),
    createdAt: now('created_at'),
  },
  (t) => [uniqueIndex('household_invites_code_uq').on(t.code)],
);

// ---------------------------------------------------------------- synced entities
const syncCols = () => ({
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }),
  version: bigint('version', { mode: 'number' }).notNull(),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
  deletedAt: ts('deleted_at'),
});
const syncIdx = (name: string, t: { ownerId: unknown; householdId: unknown; version: unknown }) => [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  index(`${name}_owner_version_idx`).on(t.ownerId as any, t.version as any),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  index(`${name}_household_version_idx`).on(t.householdId as any, t.version as any),
];

export const recipes = pgTable(
  'recipes',
  {
    ...syncCols(),
    title: text('title').notNull(),
    description: text('description'),
    photoKey: text('photo_key'),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    restMinutes: integer('rest_minutes'),
    totalMinutes: integer('total_minutes'),
    servings: integer('servings').notNull(),
    yieldLabel: text('yield_label'),
    difficulty: text('difficulty'),
    seasons: text('seasons')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    category: text('category'),
    ovenTemperatureC: integer('oven_temperature_c'),
    ovenMode: text('oven_mode'),
    notes: text('notes'),
    tips: text('tips'),
    extraInfo: text('extra_info'),
    source: text('source'),
    sourceUrl: text('source_url'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    visibility: text('visibility').notNull().default('private'),
    originRecipeId: uuid('origin_recipe_id'),
    publishedAt: ts('published_at'),
    saveCount: integer('save_count').notNull().default(0),
  },
  (t) => [
    ...syncIdx('recipes', t),
    index('recipes_public_idx').on(t.visibility, t.publishedAt),
    check('recipes_visibility_ck', sql`${t.visibility} in ('private','public')`),
  ],
);

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').notNull(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    groupName: text('group_name'),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity'),
    quantityMax: doublePrecision('quantity_max'),
    unit: text('unit'),
    note: text('note'),
  },
  // Child ids are client-generated and only unique within their recipe.
  (t) => [
    primaryKey({ columns: [t.recipeId, t.id] }),
    index('recipe_ingredients_recipe_idx').on(t.recipeId, t.position),
  ],
);

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: uuid('id').notNull(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    groupName: text('group_name'),
    text: text('text').notNull(),
    timerSeconds: integer('timer_seconds'),
    timerLabel: text('timer_label'),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.id] }),
    index('recipe_steps_recipe_idx').on(t.recipeId, t.position),
  ],
);

export const favorites = pgTable(
  'favorites',
  { ...syncCols(), recipeId: uuid('recipe_id').notNull() },
  (t) => [
    ...syncIdx('favorites', t),
    uniqueIndex('favorites_owner_recipe_uq').on(t.ownerId, t.recipeId),
    index('favorites_recipe_idx').on(t.recipeId),
  ],
);

export const collections = pgTable(
  'collections',
  {
    ...syncCols(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    position: integer('position').notNull().default(0),
  },
  (t) => [...syncIdx('collections', t)],
);

export const collectionItems = pgTable(
  'collection_items',
  {
    ...syncCols(),
    collectionId: uuid('collection_id').notNull(),
    recipeId: uuid('recipe_id').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    ...syncIdx('collection_items', t),
    index('collection_items_collection_idx').on(t.collectionId),
  ],
);

export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    ...syncCols(),
    date: date('date', { mode: 'string' }).notNull(),
    slot: text('slot').notNull(),
    recipeId: uuid('recipe_id'),
    customTitle: text('custom_title'),
    servings: integer('servings'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    ...syncIdx('meal_plan_entries', t),
    check('meal_plan_slot_ck', sql`${t.slot} in ('breakfast','lunch','snack','dinner')`),
  ],
);

export const shoppingLists = pgTable(
  'shopping_lists',
  {
    ...syncCols(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    archived: boolean('archived').notNull().default(false),
  },
  (t) => [...syncIdx('shopping_lists', t)],
);

export const shoppingItems = pgTable(
  'shopping_items',
  {
    ...syncCols(),
    listId: uuid('list_id').notNull(),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity'),
    unit: text('unit'),
    categoryKey: text('category_key').notNull().default('other'),
    checked: boolean('checked').notNull().default(false),
    position: integer('position').notNull().default(0),
    note: text('note'),
    recipeIds: uuid('recipe_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  },
  (t) => [...syncIdx('shopping_items', t), index('shopping_items_list_idx').on(t.listId)],
);

export const shoppingCategories = pgTable(
  'shopping_categories',
  {
    ...syncCols(),
    key: text('key').notNull(),
    name: text('name'),
    position: integer('position').notNull().default(0),
    hidden: boolean('hidden').notNull().default(false),
  },
  (t) => [
    ...syncIdx('shopping_categories', t),
    uniqueIndex('shopping_categories_owner_key_uq').on(t.ownerId, t.key),
  ],
);

export const userSettings = pgTable(
  'user_settings',
  { ...syncCols(), data: jsonb('data').notNull() },
  (t) => [...syncIdx('user_settings', t)],
);

/** Idempotency log for pushed operations. */
export const syncOps = pgTable(
  'sync_ops',
  {
    opId: uuid('op_id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    result: jsonb('result').notNull(),
    createdAt: now('created_at'),
  },
  (t) => [index('sync_ops_created_idx').on(t.createdAt)],
);

// ---------------------------------------------------------------- media, sharing, moderation
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    contentType: text('content_type').notNull(),
    maxBytes: integer('max_bytes').notNull(),
    sizeBytes: integer('size_bytes'),
    status: text('status').notNull().default('pending'),
    createdAt: now('created_at'),
  },
  (t) => [
    uniqueIndex('uploads_key_uq').on(t.key),
    index('uploads_owner_idx').on(t.ownerId),
    check('uploads_status_ck', sql`${t.status} in ('pending','ready')`),
  ],
);

/** Storage objects to delete asynchronously (photo replaced, recipe or account deleted). */
export const deletedObjects = pgTable('deleted_objects', {
  key: text('key').primaryKey(),
  createdAt: now('created_at'),
  attempts: integer('attempts').notNull().default(0),
});

export const shareLinks = pgTable(
  'share_links',
  {
    token: text('token').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now('created_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('share_links_recipe_idx').on(t.recipeId)],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status').notNull().default('open'),
    resolution: text('resolution'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: ts('handled_at'),
    createdAt: now('created_at'),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    uniqueIndex('reports_once_uq').on(t.recipeId, t.reporterId),
  ],
);

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email'),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    status: text('status').notNull().default('new'),
    appVersion: text('app_version'),
    platform: text('platform'),
    createdAt: now('created_at'),
  },
  (t) => [index('contact_messages_status_idx').on(t.status, t.createdAt)],
);

/** Minimal first-party analytics, only stored with the user's consent. */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform'),
    appVersion: text('app_version'),
    props: jsonb('props'),
    createdAt: now('created_at'),
  },
  (t) => [index('analytics_name_day_idx').on(t.name, t.day)],
);
