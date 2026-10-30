import { z } from 'zod';
import {
  DIFFICULTIES,
  LOCALES,
  MEAL_SLOTS,
  NOTIFICATION_CATEGORIES,
  OVEN_MODES,
  RECIPE_CATEGORIES,
  REVIEW_NOTICES,
  SEASONS,
  THEMES,
  UNIT_SYSTEMS,
} from './enums';
import { LIMITS } from './limits';

const uuid = () => z.uuid();
/** Trimmed string; empty becomes null. */
const optText = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullish()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    })
    .pipe(z.string().max(max).nullable());
const reqText = (max: number) => z.string().trim().min(1).max(max);
const minutes = z.number().int().min(0).max(LIMITS.minutesMax).nullable();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

export const ingredientSchema = z.object({
  id: uuid(),
  group: optText(LIMITS.groupName),
  name: reqText(LIMITS.ingredientName),
  quantity: z.number().positive().max(LIMITS.quantityMax).nullable(),
  quantityMax: z.number().positive().max(LIMITS.quantityMax).nullable(),
  unit: optText(24),
  note: optText(LIMITS.ingredientNote),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const stepSchema = z.object({
  id: uuid(),
  group: optText(LIMITS.groupName),
  text: reqText(LIMITS.stepText),
  timerSeconds: z.number().int().min(1).max(LIMITS.timerMaxSeconds).nullable(),
  timerLabel: optText(60),
});
export type Step = z.infer<typeof stepSchema>;

const tag = z.string().trim().min(1).max(LIMITS.tag);

export const recipeDataSchema = z
  .object({
    title: reqText(LIMITS.title),
    description: optText(LIMITS.description),
    photoKey: z.string().max(300).nullable(),
    prepMinutes: minutes,
    cookMinutes: minutes,
    restMinutes: minutes,
    totalMinutes: minutes,
    servings: z.number().int().min(1).max(LIMITS.servingsMax),
    yieldLabel: optText(40),
    difficulty: z.enum(DIFFICULTIES).nullable(),
    seasons: z
      .array(z.enum(SEASONS))
      .max(4)
      .transform((s) => [...new Set(s)]),
    category: z.enum(RECIPE_CATEGORIES).nullable(),
    ovenTemperatureC: z.number().int().min(LIMITS.ovenMinC).max(LIMITS.ovenMaxC).nullable(),
    ovenMode: z.enum(OVEN_MODES).nullable(),
    notes: optText(LIMITS.longText),
    tips: optText(LIMITS.longText),
    extraInfo: optText(LIMITS.longText),
    source: optText(LIMITS.source),
    sourceUrl: z
      .url({ protocol: /^https?$/ })
      .max(LIMITS.url)
      .nullable(),
    tags: z
      .array(tag)
      .max(LIMITS.tags)
      .transform((t) => [...new Set(t.map((x) => x.toLowerCase()))]),
    ingredients: z.array(ingredientSchema).max(LIMITS.ingredients),
    steps: z.array(stepSchema).max(LIMITS.steps),
    // Added later: defaults keep older data and backups valid.
    /** The user's own rating, 1 to 5 stars. */
    rating: z.number().int().min(1).max(5).nullable().default(null),
    /** The user's own remarks ("less salt next time"), kept apart from the imported notes. */
    personalNote: optText(LIMITS.personalNote).default(null),
    /** Saved automatically from the share sheet: what to check, until the user dismisses it. */
    review: z.enum(REVIEW_NOTICES).nullable().default(null),
  })
  .strict();
export type RecipeData = z.infer<typeof recipeDataSchema>;
export type RecipeInput = z.input<typeof recipeDataSchema>;

export const favoriteDataSchema = z.object({ recipeId: uuid() }).strict();
export const collectionDataSchema = z
  .object({
    name: reqText(LIMITS.collectionName),
    emoji: z.string().max(16).nullable(),
    position: z.number().int().min(0).max(100000),
  })
  .strict();
export const collectionItemDataSchema = z
  .object({ collectionId: uuid(), recipeId: uuid(), position: z.number().int().min(0).max(100000) })
  .strict();

export const mealPlanEntryDataSchema = z
  .object({
    date: isoDate,
    slot: z.enum(MEAL_SLOTS),
    recipeId: uuid().nullable(),
    customTitle: optText(LIMITS.customTitle),
    servings: z.number().int().min(1).max(LIMITS.servingsMax).nullable(),
    position: z.number().int().min(0).max(1000),
    /** Leftovers of another planned meal: eaten, but not bought or cooked again. */
    leftover: z.boolean().default(false),
  })
  .strict()
  .refine((d) => d.recipeId !== null || d.customTitle !== null, {
    message: 'recipe_or_title_required',
  });

export const shoppingListDataSchema = z
  .object({
    name: reqText(LIMITS.listName),
    emoji: z.string().max(16).nullable(),
    archived: z.boolean(),
  })
  .strict();

export const shoppingItemDataSchema = z
  .object({
    listId: uuid(),
    name: reqText(LIMITS.shoppingItemName),
    quantity: z.number().positive().max(LIMITS.quantityMax).nullable(),
    unit: optText(24),
    categoryKey: z.string().min(1).max(60),
    checked: z.boolean(),
    position: z.number().int().min(0).max(1000000),
    note: optText(200),
    recipeIds: z.array(uuid()).max(50),
    /** Estimated price of the line, in the user's currency. */
    price: z.number().min(0).max(LIMITS.priceMax).nullable().default(null),
  })
  .strict();

export const shoppingCategoryDataSchema = z
  .object({
    key: z.string().min(1).max(60),
    name: optText(60),
    position: z.number().int().min(0).max(1000),
    hidden: z.boolean(),
  })
  .strict();

// A category added later is on for data saved before it existed.
export const notificationPrefsSchema = z.object(
  Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, z.boolean().default(true)])) as Record<
    (typeof NOTIFICATION_CATEGORIES)[number],
    z.ZodDefault<z.ZodBoolean>
  >,
);

export const settingsDataSchema = z
  .object({
    theme: z.enum(THEMES),
    // A language no longer offered (older data) falls back to the device language.
    locale: z.enum(LOCALES).nullable().catch(null),
    unitSystem: z.enum(UNIT_SYSTEMS),
    activeShoppingListId: uuid().nullable(),
    notifications: notificationPrefsSchema,
    dinnerReminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    hapticsEnabled: z.boolean(),
    defaultServings: z.number().int().min(1).max(LIMITS.servingsMax),
    onboardingDone: z.boolean(),
    /** Used to greet the user; optional (older data has no such field). */
    firstName: optText(LIMITS.firstName).default(null),
    /** Text size in cooking mode (1 = normal). */
    cookTextScale: z.number().min(0.8).max(2).default(1),
    /** Cook mode reads each step aloud when it is shown. */
    cookReadAloud: z.boolean().default(false),
  })
  .strict();
export type SettingsData = z.infer<typeof settingsDataSchema>;

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  locale: null,
  unitSystem: 'metric',
  activeShoppingListId: null,
  notifications: {
    mealReminder: true,
    shoppingReady: true,
    planningNudge: true,
    timers: true,
    expiry: true,
  },
  dinnerReminderTime: '17:30',
  hapticsEnabled: true,
  defaultServings: 4,
  onboardingDone: false,
  firstName: null,
  cookTextScale: 1,
  cookReadAloud: false,
};

/** One time a recipe was cooked (cooking history). */
export const cookLogDataSchema = z
  .object({
    recipeId: uuid(),
    date: isoDate,
    /** "My result": a photo of the dish as the user made it (synced like recipe photos). */
    photoKey: z.string().max(200).nullable().default(null),
  })
  .strict();

export const planTemplateMealSchema = z
  .object({
    /** 0 = first day of the week. */
    day: z.number().int().min(0).max(6),
    slot: z.enum(MEAL_SLOTS),
    recipeId: uuid().nullable(),
    customTitle: optText(LIMITS.customTitle),
    servings: z.number().int().min(1).max(LIMITS.servingsMax).nullable(),
    leftover: z.boolean().default(false),
  })
  .strict();
export type PlanTemplateMeal = z.infer<typeof planTemplateMealSchema>;

/** A reusable week of meals ("Classic week"). */
export const planTemplateDataSchema = z
  .object({
    name: reqText(LIMITS.templateName),
    meals: z.array(planTemplateMealSchema).max(LIMITS.templateMeals),
  })
  .strict();

/** Last price paid for a product, remembered to estimate the shopping budget. */
export const priceDataSchema = z
  .object({
    name: reqText(LIMITS.shoppingItemName),
    price: z.number().min(0).max(LIMITS.priceMax),
    quantity: z.number().positive().max(LIMITS.quantityMax).nullable(),
    unit: optText(24),
  })
  .strict();

export const PANTRY_PLACES = ['pantry', 'fridge', 'freezer'] as const;
export type PantryPlace = (typeof PANTRY_PLACES)[number];

/** Something at home (cupboard, fridge, freezer): not bought again, used before it expires. */
export const pantryItemDataSchema = z
  .object({
    name: reqText(LIMITS.shoppingItemName),
    quantity: z.number().positive().max(LIMITS.quantityMax).nullable(),
    unit: optText(24),
    place: z.enum(PANTRY_PLACES).default('pantry'),
    /** Best-before / use-by date, reminded the day before. */
    expiresOn: isoDate.nullable().default(null),
  })
  .strict();
export type PantryItemData = z.infer<typeof pantryItemDataSchema>;

export type FavoriteData = z.infer<typeof favoriteDataSchema>;
export type CollectionData = z.infer<typeof collectionDataSchema>;
export type CollectionItemData = z.infer<typeof collectionItemDataSchema>;
export type MealPlanEntryData = z.infer<typeof mealPlanEntryDataSchema>;
export type ShoppingListData = z.infer<typeof shoppingListDataSchema>;
export type ShoppingItemData = z.infer<typeof shoppingItemDataSchema>;
export type ShoppingCategoryData = z.infer<typeof shoppingCategoryDataSchema>;
export type CookLogData = z.infer<typeof cookLogDataSchema>;
export type PlanTemplateData = z.infer<typeof planTemplateDataSchema>;
export type PriceData = z.infer<typeof priceDataSchema>;
