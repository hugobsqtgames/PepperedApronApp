import {
  addDays,
  categorizeIngredient,
  deductPantry,
  pantryItemDataSchema,
  weekSummary,
  type PantryItemData,
  type PantryPlace,
  cookLogDataSchema,
  dietTags,
  estimateLinePrice,
  findDuplicate,
  ingredientKey,
  leftoverSlot,
  mealsFromTemplate,
  planTemplateDataSchema,
  priceDataSchema,
  priceId,
  recipeSeasons,
  templateFromWeek,
  toIsoDate,
  uuidv5,
  collectionItemId,
  computeTotalMinutes,
  DEFAULT_SETTINGS,
  favoriteId,
  mealPlanEntryDataSchema,
  nextPosition,
  parseIngredientLine,
  planMergeIntoList,
  recipeDataSchema,
  settingsDataSchema,
  SETTINGS_ID,
  SHOPPING_CATEGORIES,
  shoppingCategoryId,
  shoppingItemDataSchema,
  shoppingLinesFromPlan,
  shoppingListDataSchema,
  collectionDataSchema,
  sortCategories,
  sortEntries,
  uuidv7,
  type CollectionData,
  type DuplicateMatch,
  type PlanTemplateData,
  type MealPlanEntryData,
  type MealSlot,
  type RecipeData,
  type RecipeDraft,
  type RecipeInput,
  type SearchableRecipe,
  type SettingsData,
  type ShoppingItemData,
  type ShoppingListData,
} from '@pepperedapron/core';
import type { z } from 'zod';
import type { LocalRecord, LocalStore } from './store';

export class ValidationError extends Error {
  constructor(public readonly issues: { path: string; code: string }[]) {
    super('validation_error');
  }
}

function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success)
    throw new ValidationError(
      r.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
    );
  return r.data;
}

export type Recipe = LocalRecord<'recipe'>;

export const emptyRecipe = (servings = 4): RecipeData => ({
  title: '',
  description: null,
  photoKey: null,
  prepMinutes: null,
  cookMinutes: null,
  restMinutes: null,
  totalMinutes: null,
  servings,
  yieldLabel: null,
  difficulty: null,
  seasons: [],
  category: null,
  ovenTemperatureC: null,
  ovenMode: null,
  notes: null,
  tips: null,
  extraInfo: null,
  source: null,
  sourceUrl: null,
  tags: [],
  ingredients: [],
  steps: [],
  rating: null,
  personalNote: null,
  review: null,
});

/** Turn an import draft into editable recipe data (the user reviews everything). */
export function recipeFromDraft(d: RecipeDraft, defaultServings = 4): RecipeData {
  return {
    ...emptyRecipe(d.servings ?? defaultServings),
    title: d.title ?? '',
    description: d.description,
    prepMinutes: d.prepMinutes,
    cookMinutes: d.cookMinutes,
    restMinutes: d.restMinutes,
    totalMinutes: d.totalMinutes,
    yieldLabel: d.yieldLabel,
    difficulty: d.difficulty,
    category: d.category,
    ovenTemperatureC: d.ovenTemperatureC,
    notes:
      [d.notes, d.unparsed.length ? d.unparsed.join('\n') : null].filter(Boolean).join('\n\n') ||
      null,
    tips: d.tips,
    source: d.author
      ? `${d.source ?? ''}${d.source ? ' · ' : ''}${d.author}`.slice(0, 500)
      : d.source,
    sourceUrl: d.sourceUrl,
    tags: d.tags.slice(0, 20),
    ingredients: d.ingredients
      .slice(0, 200)
      .map((i) => ({ id: uuidv7(), ...i, name: i.name.slice(0, 200) })),
    steps: d.steps.slice(0, 100).map((s) => ({ id: uuidv7(), ...s, text: s.text.slice(0, 3000) })),
  };
}

export class Repos {
  constructor(private readonly store: LocalStore) {}

  // ================================================================== settings
  settings(): SettingsData {
    const r = this.store.get('settings', SETTINGS_ID);
    return { ...DEFAULT_SETTINGS, ...(r?.data ?? {}) };
  }
  async updateSettings(patch: Partial<SettingsData>): Promise<SettingsData> {
    const next = validate(settingsDataSchema, { ...this.settings(), ...patch });
    await this.store.write('settings', SETTINGS_ID, next);
    return next;
  }

  // ================================================================== recipes
  recipes(): Recipe[] {
    return this.store.all('recipe');
  }
  /** All recipes, most recently changed first. */
  library(): Recipe[] {
    return this.recipes().sort((a, b) => b.hlc.localeCompare(a.hlc));
  }
  recipe(id: string): Recipe | null {
    return this.store.get('recipe', id);
  }
  async createRecipe(input: RecipeInput): Promise<Recipe> {
    const data = validate(recipeDataSchema, input);
    return this.store.write('recipe', uuidv7(), data);
  }
  async updateRecipe(id: string, patch: Partial<RecipeInput>): Promise<Recipe> {
    const cur = this.store.get('recipe', id);
    if (!cur) throw new Error('not_found');
    const data = validate(recipeDataSchema, { ...cur.data, ...patch });
    return this.store.write('recipe', id, data);
  }
  /** Deletes the recipe and its favorite/collection entries; planned meals keep its title. */
  async deleteRecipe(id: string) {
    const title = this.store.get('recipe', id)?.data.title ?? '';
    for (const e of this.store.all('mealPlanEntry').filter((x) => x.data.recipeId === id)) {
      await this.store.write('mealPlanEntry', e.id, {
        ...e.data,
        recipeId: null,
        customTitle: title.slice(0, 200) || '—',
      });
    }
    for (const tp of this.store.all('planTemplate'))
      if (tp.data.meals.some((m) => m.recipeId === id))
        await this.store.write('planTemplate', tp.id, {
          ...tp.data,
          meals: tp.data.meals.map((m) =>
            m.recipeId === id
              ? { ...m, recipeId: null, customTitle: title.slice(0, 200) || '—' }
              : m,
          ),
        });
    await this.store.removeMany([
      ...this.store
        .all('favorite')
        .filter((x) => x.data.recipeId === id)
        .map((f) => ({ entity: 'favorite' as const, id: f.id })),
      ...this.store
        .all('collectionItem')
        .filter((x) => x.data.recipeId === id)
        .map((c) => ({ entity: 'collectionItem' as const, id: c.id })),
      ...this.store
        .all('cookLog')
        .filter((x) => x.data.recipeId === id)
        .map((c) => ({ entity: 'cookLog' as const, id: c.id })),
      { entity: 'recipe', id },
    ]);
  }
  async duplicateRecipe(id: string, suffix: string): Promise<Recipe> {
    const cur = this.store.get('recipe', id);
    if (!cur) throw new Error('not_found');
    return this.createRecipe({
      ...cur.data,
      title: `${cur.data.title} ${suffix}`.slice(0, 200),
      ingredients: cur.data.ingredients.map((i) => ({ ...i, id: uuidv7() })),
      steps: cur.data.steps.map((s) => ({ ...s, id: uuidv7() })),
      review: null,
    });
  }
  /** A recipe that looks like the same as this one (same link, or same title and ingredients). */
  findDuplicate(
    c: { title: string; sourceUrl: string | null; ingredientNames: string[] },
    excludeId?: string,
  ): DuplicateMatch | null {
    return findDuplicate(
      c,
      this.recipes()
        .filter((r) => r.id !== excludeId)
        .map((r) => ({
          id: r.id,
          title: r.data.title,
          sourceUrl: r.data.sourceUrl,
          ingredientNames: r.data.ingredients.map((i) => i.name),
        })),
    );
  }
  setRating(id: string, rating: number | null) {
    return this.updateRecipe(id, { rating });
  }
  setPersonalNote(id: string, personalNote: string | null) {
    return this.updateRecipe(id, { personalNote });
  }
  /** The user checked a recipe saved from the share sheet. */
  dismissReview(id: string) {
    return this.updateRecipe(id, { review: null });
  }
  searchable(recipes: Recipe[] = this.recipes()): (SearchableRecipe & { record: Recipe })[] {
    return recipes.map((r) => ({
      id: r.id,
      title: r.data.title,
      description: r.data.description,
      category: r.data.category,
      tags: r.data.tags,
      difficulty: r.data.difficulty,
      seasons: recipeSeasons(r.data),
      totalMinutes: computeTotalMinutes(r.data),
      ingredientNames: r.data.ingredients.map((i) => i.name),
      updatedAt: r.updatedAt,
      diets: dietTags(r.data.ingredients.map((i) => i.name)),
      record: r,
    }));
  }
  randomRecipe(exclude?: string): Recipe | null {
    const all = this.library().filter((r) => r.id !== exclude);
    return all.length ? all[Math.floor(Math.random() * all.length)]! : null;
  }

  // ================================================================== cooking history
  /** Times a recipe was cooked, most recent first. */
  cookLogs(recipeId: string): LocalRecord<'cookLog'>[] {
    return this.store
      .all('cookLog')
      .filter((c) => c.data.recipeId === recipeId)
      .sort((a, b) => b.data.date.localeCompare(a.data.date));
  }
  /** Cooked count and last date of every recipe cooked at least once. */
  cookStats(): Map<string, { count: number; last: string }> {
    const out = new Map<string, { count: number; last: string }>();
    for (const c of this.store.all('cookLog')) {
      const cur = out.get(c.data.recipeId);
      if (!cur) out.set(c.data.recipeId, { count: 1, last: c.data.date });
      else {
        cur.count++;
        if (c.data.date > cur.last) cur.last = c.data.date;
      }
    }
    return out;
  }
  /** One entry per recipe and day: tapping twice the same evening is harmless. */
  async logCooked(recipeId: string, date: string = toIsoDate(new Date())) {
    const data = validate(cookLogDataSchema, { recipeId, date });
    return this.store.write('cookLog', uuidv5(`cook-log:${recipeId}:${date}`), data);
  }
  removeCookLog(id: string) {
    return this.store.remove('cookLog', id);
  }
  /** Recipes cooked before but not since `days` days: ideas to bring back. */
  forgottenRecipes(today: string = toIsoDate(new Date()), days = 60): Recipe[] {
    const limit = addDays(today, -days);
    const stats = this.cookStats();
    return this.recipes()
      .filter((r) => {
        const s = stats.get(r.id);
        return s !== undefined && s.last < limit;
      })
      .sort((a, b) => stats.get(a.id)!.last.localeCompare(stats.get(b.id)!.last));
  }

  // ================================================================== favorites
  isFavorite(recipeId: string): boolean {
    return this.store.get('favorite', favoriteId(recipeId)) !== null;
  }
  favoriteRecipes(): Recipe[] {
    return this.store
      .all('favorite')
      .sort((a, b) => b.hlc.localeCompare(a.hlc))
      .map((f) => this.store.get('recipe', f.data.recipeId))
      .filter((r): r is Recipe => r !== null);
  }
  /** Returns the new state. Deterministic ids make rapid double taps harmless. */
  async toggleFavorite(recipeId: string): Promise<boolean> {
    const id = favoriteId(recipeId);
    if (this.store.get('favorite', id)) {
      await this.store.remove('favorite', id);
      return false;
    }
    await this.store.write('favorite', id, { recipeId });
    return true;
  }

  // ================================================================== collections
  collections(): LocalRecord<'collection'>[] {
    return this.store
      .all('collection')
      .sort((a, b) => a.data.position - b.data.position || a.data.name.localeCompare(b.data.name));
  }
  collectionRecipes(collectionId: string): Recipe[] {
    return this.store
      .all('collectionItem')
      .filter((i) => i.data.collectionId === collectionId)
      .sort((a, b) => a.data.position - b.data.position)
      .map((i) => this.store.get('recipe', i.data.recipeId))
      .filter((r): r is Recipe => r !== null);
  }
  collectionsOf(recipeId: string): string[] {
    return this.store
      .all('collectionItem')
      .filter((i) => i.data.recipeId === recipeId)
      .map((i) => i.data.collectionId);
  }
  async createCollection(
    name: string,
    emoji: string | null = null,
  ): Promise<LocalRecord<'collection'>> {
    const position = this.collections().length;
    const data: CollectionData = validate(collectionDataSchema, {
      name,
      emoji,
      position,
    });
    return this.store.write('collection', uuidv7(), data);
  }
  async updateCollection(id: string, patch: Partial<CollectionData>) {
    const cur = this.store.get('collection', id);
    if (!cur) throw new Error('not_found');
    return this.store.write(
      'collection',
      id,
      validate(collectionDataSchema, { ...cur.data, ...patch }),
    );
  }
  deleteCollection(id: string) {
    return this.store.removeMany([
      ...this.store
        .all('collectionItem')
        .filter((x) => x.data.collectionId === id)
        .map((i) => ({ entity: 'collectionItem' as const, id: i.id })),
      { entity: 'collection', id },
    ]);
  }
  async setInCollection(collectionId: string, recipeId: string, inside: boolean) {
    const id = collectionItemId(collectionId, recipeId);
    if (!inside) return this.store.remove('collectionItem', id);
    if (this.store.get('collectionItem', id)) return;
    const position = this.store
      .all('collectionItem')
      .filter((i) => i.data.collectionId === collectionId).length;
    await this.store.write('collectionItem', id, { collectionId, recipeId, position });
  }

  // ================================================================== meal plan
  entries(start: string, end: string): LocalRecord<'mealPlanEntry'>[] {
    return sortEntries(
      this.store
        .all('mealPlanEntry')
        .filter((e) => e.data.date >= start && e.data.date <= end)
        .map((e) => ({ ...e, date: e.data.date, slot: e.data.slot, position: e.data.position })),
    );
  }
  async planMeal(p: {
    date: string;
    slot: MealSlot;
    recipeId?: string | null;
    customTitle?: string | null;
    servings?: number | null;
    leftover?: boolean;
  }) {
    const all = this.store
      .all('mealPlanEntry')
      .map((e) => ({ id: e.id, date: e.data.date, slot: e.data.slot, position: e.data.position }));
    const data: MealPlanEntryData = validate(mealPlanEntryDataSchema, {
      date: p.date,
      slot: p.slot,
      recipeId: p.recipeId ?? null,
      customTitle: p.customTitle ?? null,
      servings: p.servings ?? null,
      position: nextPosition(all, p.date, p.slot),
      leftover: p.leftover ?? false,
    });
    return this.store.write('mealPlanEntry', uuidv7(), data);
  }
  /**
   * Cook more for leftovers: the meal is cooked for `portions` more people, and the leftovers are
   * planned (by default the next day's lunch) without being bought twice.
   */
  async planLeftovers(
    entryId: string,
    portions: number,
    target?: { date: string; slot: MealSlot },
  ) {
    const e = this.store.get('mealPlanEntry', entryId);
    if (!e) throw new Error('not_found');
    const recipe = e.data.recipeId ? this.recipe(e.data.recipeId) : null;
    const eaters = e.data.servings ?? recipe?.data.servings ?? this.settings().defaultServings;
    const to = target ?? leftoverSlot(e.data.date);
    await this.updateMeal(entryId, { servings: Math.min(eaters + portions, 100) });
    return this.planMeal({
      date: to.date,
      slot: to.slot,
      recipeId: recipe ? recipe.id : null,
      customTitle: recipe ? null : e.data.customTitle,
      servings: portions,
      leftover: true,
    });
  }

  // ---------------------------------------------------------------- reusable weeks
  templates(): LocalRecord<'planTemplate'>[] {
    return this.store.all('planTemplate').sort((a, b) => a.data.name.localeCompare(b.data.name));
  }
  async saveWeekAsTemplate(name: string, weekStart: string) {
    const meals = templateFromWeek(
      this.entries(weekStart, addDays(weekStart, 6)).map((e) => ({ ...e.data })),
      weekStart,
    );
    const data: PlanTemplateData = validate(planTemplateDataSchema, { name, meals });
    return this.store.write('planTemplate', uuidv7(), data);
  }
  /** Fill a week from a template; `replace` empties the week first. Returns the meals added. */
  async applyTemplate(id: string, weekStart: string, replace = false): Promise<number> {
    const tp = this.store.get('planTemplate', id);
    if (!tp) throw new Error('not_found');
    if (replace)
      await this.store.remove(
        'mealPlanEntry',
        ...this.entries(weekStart, addDays(weekStart, 6)).map((e) => e.id),
      );
    let added = 0;
    for (const m of mealsFromTemplate(tp.data.meals, weekStart)) {
      const recipeId = m.recipeId && this.recipe(m.recipeId) ? m.recipeId : null;
      if (!recipeId && !m.customTitle) continue;
      await this.planMeal({
        date: m.date,
        slot: m.slot,
        recipeId,
        customTitle: recipeId ? null : m.customTitle,
        servings: m.servings,
        leftover: m.leftover,
      });
      added++;
    }
    return added;
  }
  async renameTemplate(id: string, name: string) {
    const cur = this.store.get('planTemplate', id);
    if (!cur) throw new Error('not_found');
    return this.store.write(
      'planTemplate',
      id,
      validate(planTemplateDataSchema, { ...cur.data, name }),
    );
  }
  deleteTemplate(id: string) {
    return this.store.remove('planTemplate', id);
  }
  async moveMeal(id: string, date: string, slot: MealSlot) {
    const cur = this.store.get('mealPlanEntry', id);
    if (!cur) throw new Error('not_found');
    const all = this.store
      .all('mealPlanEntry')
      .filter((e) => e.id !== id)
      .map((e) => ({ id: e.id, date: e.data.date, slot: e.data.slot, position: e.data.position }));
    return this.store.write(
      'mealPlanEntry',
      id,
      validate(mealPlanEntryDataSchema, {
        ...cur.data,
        date,
        slot,
        position: nextPosition(all, date, slot),
      }),
    );
  }
  async updateMeal(id: string, patch: Partial<MealPlanEntryData>) {
    const cur = this.store.get('mealPlanEntry', id);
    if (!cur) throw new Error('not_found');
    return this.store.write(
      'mealPlanEntry',
      id,
      validate(mealPlanEntryDataSchema, { ...cur.data, ...patch }),
    );
  }
  removeMeal(id: string) {
    return this.store.remove('mealPlanEntry', id);
  }

  // ================================================================== shopping
  lists(): LocalRecord<'shoppingList'>[] {
    return this.store
      .all('shoppingList')
      .filter((l) => !l.data.archived)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  activeList(): LocalRecord<'shoppingList'> | null {
    const id = this.settings().activeShoppingListId;
    const lists = this.lists();
    return (id ? lists.find((l) => l.id === id) : undefined) ?? lists[0] ?? null;
  }
  async createList(name: string, emoji: string | null = null, makeActive = true) {
    const data: ShoppingListData = validate(shoppingListDataSchema, {
      name,
      emoji,
      archived: false,
    });
    const rec = await this.store.write('shoppingList', uuidv7(), data);
    if (makeActive) await this.updateSettings({ activeShoppingListId: rec.id });
    return rec;
  }
  /** The active list, created on first use so "add to list" always works. */
  async ensureActiveList(defaultName: string) {
    return this.activeList() ?? this.createList(defaultName);
  }
  async updateList(id: string, patch: Partial<ShoppingListData>) {
    const cur = this.store.get('shoppingList', id);
    if (!cur) throw new Error('not_found');
    return this.store.write(
      'shoppingList',
      id,
      validate(shoppingListDataSchema, { ...cur.data, ...patch }),
    );
  }
  async deleteList(id: string) {
    await this.store.removeMany([
      ...this.items(id).map((i) => ({ entity: 'shoppingItem' as const, id: i.id })),
      { entity: 'shoppingList', id },
    ]);
    if (this.settings().activeShoppingListId === id)
      await this.updateSettings({ activeShoppingListId: this.lists()[0]?.id ?? null });
  }
  setActiveList(id: string) {
    return this.updateSettings({ activeShoppingListId: id });
  }
  items(listId: string): LocalRecord<'shoppingItem'>[] {
    return this.store.all('shoppingItem').filter((i) => i.data.listId === listId);
  }
  /** Free text such as "2 kg pommes de terre" is parsed and put in the right aisle. */
  async addItemText(listId: string, text: string) {
    const parsed = parseIngredientLine(text);
    if (!parsed) return null;
    return this.addItem(listId, {
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      note: parsed.note,
    });
  }
  async addItem(
    listId: string,
    p: {
      name: string;
      quantity?: number | null;
      unit?: string | null;
      note?: string | null;
      categoryKey?: string;
      recipeIds?: string[];
      price?: number | null;
    },
  ) {
    const list = this.store.get('shoppingList', listId);
    if (!list) throw new Error('not_found');
    const items = this.items(listId);
    const data: ShoppingItemData = validate(shoppingItemDataSchema, {
      listId,
      name: p.name,
      quantity: p.quantity ?? null,
      unit: p.unit ?? null,
      categoryKey: p.categoryKey ?? categorizeIngredient(p.name),
      checked: false,
      position: items.length ? Math.max(...items.map((i) => i.data.position)) + 1 : 0,
      note: p.note ?? null,
      recipeIds: p.recipeIds ?? [],
      price:
        p.price !== undefined
          ? p.price
          : this.estimatePrice(p.name, p.quantity ?? null, p.unit ?? null),
    });
    return this.store.write('shoppingItem', uuidv7(), data);
  }
  /** Last price paid for this product, remembered from earlier lists. */
  knownPrice(name: string): LocalRecord<'price'> | null {
    const key = ingredientKey(name);
    return key ? this.store.get('price', priceId(key)) : null;
  }
  estimatePrice(name: string, quantity: number | null, unit: string | null): number | null {
    const known = this.knownPrice(name);
    return known ? estimateLinePrice({ quantity, unit }, known.data) : null;
  }
  /** Set the price of a line; it is remembered for the next lists. */
  async setItemPrice(id: string, price: number | null) {
    const cur = this.store.get('shoppingItem', id);
    if (!cur) throw new Error('not_found');
    await this.updateItem(id, { price });
    const key = ingredientKey(cur.data.name);
    if (price === null || !key) return;
    await this.store.write(
      'price',
      priceId(key),
      validate(priceDataSchema, {
        name: cur.data.name,
        price,
        quantity: cur.data.quantity,
        unit: cur.data.unit,
      }),
    );
  }
  async updateItem(id: string, patch: Partial<ShoppingItemData>) {
    const cur = this.store.get('shoppingItem', id);
    if (!cur) throw new Error('not_found');
    return this.store.write(
      'shoppingItem',
      id,
      validate(shoppingItemDataSchema, { ...cur.data, ...patch }),
    );
  }
  toggleItem(id: string) {
    const cur = this.store.get('shoppingItem', id);
    if (!cur) return Promise.resolve(null);
    return this.updateItem(id, { checked: !cur.data.checked });
  }
  removeItem(id: string) {
    return this.store.remove('shoppingItem', id);
  }
  async clearChecked(listId: string) {
    await this.store.remove(
      'shoppingItem',
      ...this.items(listId)
        .filter((x) => x.data.checked)
        .map((i) => i.id),
    );
  }
  async moveItemToList(id: string, listId: string) {
    const cur = this.store.get('shoppingItem', id);
    if (!cur || cur.data.listId === listId) return;
    await this.addItem(listId, { ...cur.data });
    await this.store.remove('shoppingItem', id);
  }
  /** Add every ingredient of the planned meals between two dates, merged and scaled. */
  async addPlanToList(
    listId: string,
    start: string,
    end: string,
  ): Promise<{ added: number; updated: number; skipped: number }> {
    const planned = this.entries(start, end)
      // Leftovers were cooked with the first meal.
      .filter((e) => e.data.recipeId && !e.data.leftover)
      .map((e) => ({ entry: e, recipe: this.store.get('recipe', e.data.recipeId!) }))
      .filter(
        (x): x is { entry: LocalRecord<'mealPlanEntry'>; recipe: Recipe } => x.recipe !== null,
      )
      .map(({ entry, recipe }) => ({
        recipeId: recipe.id,
        recipeServings: recipe.data.servings,
        plannedServings: entry.data.servings,
        ingredients: recipe.data.ingredients,
      }));
    return this.addLines(listId, shoppingLinesFromPlan(planned, this.settings().defaultServings));
  }
  /** Add one recipe's ingredients for a number of servings. */
  async addRecipeToList(listId: string, recipeId: string, servings: number) {
    const r = this.store.get('recipe', recipeId);
    if (!r) throw new Error('not_found');
    return this.addLines(
      listId,
      shoppingLinesFromPlan(
        [
          {
            recipeId,
            recipeServings: r.data.servings,
            plannedServings: servings,
            ingredients: r.data.ingredients,
          },
        ],
        servings,
      ),
    );
  }
  private async addLines(listId: string, all: ReturnType<typeof shoppingLinesFromPlan>) {
    // What is at home is not bought again (or only what is missing).
    const { lines, skipped } = deductPantry(
      all,
      this.pantryItems().map((p) => p.data),
    );
    const existing = this.items(listId).map((i) => ({ id: i.id, ...i.data }));
    let added = 0;
    let updated = 0;
    for (const p of planMergeIntoList(existing, lines)) {
      if (p.kind === 'update') {
        const cur = this.store.get('shoppingItem', p.id);
        await this.updateItem(p.id, {
          quantity: p.quantity,
          unit: p.unit,
          recipeIds: p.recipeIds.slice(0, 50),
          price: cur
            ? (this.estimatePrice(cur.data.name, p.quantity, p.unit) ?? cur.data.price)
            : null,
        });
        updated++;
      } else {
        await this.addItem(listId, {
          name: p.line.name,
          quantity: p.line.quantity,
          unit: p.line.unit,
          categoryKey: p.categoryKey,
          recipeIds: p.line.recipeIds.slice(0, 50),
        });
        added++;
      }
    }
    return { added, updated, skipped: skipped.length };
  }

  // ---------------------------------------------------------------- pantry
  /** Things at home, by place, the soonest to expire first. */
  pantryItems(place?: PantryPlace): LocalRecord<'pantryItem'>[] {
    return this.store
      .all('pantryItem')
      .filter((p) => !place || p.data.place === place)
      .sort(
        (a, b) =>
          (a.data.expiresOn ?? '9999').localeCompare(b.data.expiresOn ?? '9999') ||
          a.data.name.localeCompare(b.data.name),
      );
  }
  /**
   * Put something away ("2 kg de pommes de terre"): merged with the same thing in the same place
   * when the units match, so the quantities add up.
   */
  async addPantryItem(p: {
    name: string;
    quantity?: number | null;
    unit?: string | null;
    place?: PantryPlace;
    expiresOn?: string | null;
  }) {
    const place = p.place ?? 'pantry';
    const key = ingredientKey(p.name);
    const same = this.pantryItems(place).find(
      (x) => ingredientKey(x.data.name) === key && (x.data.unit ?? null) === (p.unit ?? null),
    );
    if (same) {
      const quantity =
        same.data.quantity !== null && p.quantity != null
          ? same.data.quantity + p.quantity
          : (same.data.quantity ?? p.quantity ?? null);
      return this.updatePantryItem(same.id, {
        quantity,
        expiresOn: p.expiresOn ?? same.data.expiresOn,
      });
    }
    const data: PantryItemData = validate(pantryItemDataSchema, {
      name: p.name,
      quantity: p.quantity ?? null,
      unit: p.unit ?? null,
      place,
      expiresOn: p.expiresOn ?? null,
    });
    return this.store.write('pantryItem', uuidv7(), data);
  }
  async addPantryText(text: string, place: PantryPlace = 'pantry') {
    const parsed = parseIngredientLine(text);
    if (!parsed) return null;
    return this.addPantryItem({ ...parsed, place });
  }
  async updatePantryItem(id: string, patch: Partial<PantryItemData>) {
    const cur = this.store.get('pantryItem', id);
    if (!cur) throw new Error('not_found');
    return this.store.write(
      'pantryItem',
      id,
      validate(pantryItemDataSchema, { ...cur.data, ...patch }),
    );
  }
  removePantryItem(id: string) {
    return this.store.remove('pantryItem', id);
  }
  /** A ticked shopping line goes into the cupboard (or fridge). */
  async storeBoughtItem(itemId: string, place: PantryPlace) {
    const it = this.store.get('shoppingItem', itemId);
    if (!it) throw new Error('not_found');
    return this.addPantryItem({
      name: it.data.name,
      quantity: it.data.quantity,
      unit: it.data.unit,
      place,
    });
  }

  /** Planning screen: what the week looked like (meals, cooking, vegetarian share, budget). */
  weekSummary(start: string, end: string) {
    return weekSummary({
      start,
      end,
      entries: this.entries(start, end).map((e) => e.data),
      logs: this.store.all('cookLog').map((l) => l.data),
      recipeIngredients: (id) =>
        this.store.get('recipe', id)?.data.ingredients.map((i) => i.name) ?? null,
      items: this.store.all('shoppingItem').map((i) => i.data),
    });
  }

  // ---------------------------------------------------------------- aisles
  /** Aisle order for the user's store, plus custom aisles. */
  categories(): { key: string; name: string | null; custom: boolean; hidden: boolean }[] {
    const rows = this.store.all('shoppingCategory');
    const byKey = new Map(rows.map((r) => [r.data.key, r.data]));
    const custom = rows.filter(
      (r) => !(SHOPPING_CATEGORIES as readonly string[]).includes(r.data.key),
    );
    const keys = sortCategories(
      rows
        .sort((a, b) => a.data.position - b.data.position)
        .map((r) => r.data.key)
        .filter((k) => (SHOPPING_CATEGORIES as readonly string[]).includes(k)),
    );
    const ordered = [
      ...keys.map((k) => ({
        key: k,
        position: byKey.get(k)?.position ?? SHOPPING_CATEGORIES.indexOf(k as never),
      })),
      ...custom.map((c) => ({ key: c.data.key, position: c.data.position })),
    ].sort((a, b) => a.position - b.position);
    return ordered.map((o) => ({
      key: o.key,
      name: byKey.get(o.key)?.name ?? null,
      custom: !(SHOPPING_CATEGORIES as readonly string[]).includes(o.key),
      hidden: byKey.get(o.key)?.hidden ?? false,
    }));
  }
  categoryOrder(): string[] {
    return this.categories().map((c) => c.key);
  }
  async setCategoryOrder(keys: string[]) {
    const existing = new Map(this.store.all('shoppingCategory').map((c) => [c.data.key, c]));
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const cur = existing.get(key);
      const id = cur?.id ?? shoppingCategoryId(key);
      await this.store.write('shoppingCategory', id, {
        key,
        name: cur?.data.name ?? null,
        position: i,
        hidden: cur?.data.hidden ?? false,
      });
    }
  }
  async createCategory(name: string) {
    const id = uuidv7();
    const position = this.categories().length;
    await this.store.write('shoppingCategory', id, {
      key: id,
      name: name.trim().slice(0, 60),
      position,
      hidden: false,
    });
    return id;
  }
  async renameCategory(key: string, name: string | null) {
    const cur = this.store.all('shoppingCategory').find((c) => c.data.key === key);
    await this.store.write('shoppingCategory', cur?.id ?? shoppingCategoryId(key), {
      key,
      name: name?.trim().slice(0, 60) || null,
      position: cur?.data.position ?? this.categoryOrder().indexOf(key),
      hidden: cur?.data.hidden ?? false,
    });
  }
}
