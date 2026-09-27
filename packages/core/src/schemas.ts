import { z } from 'zod';
import {
  DIFFICULTIES,
  LOCALES,
  MEAL_SLOTS,
  NOTIFICATION_CATEGORIES,
  OVEN_MODES,
  RECIPE_CATEGORIES,
  SEASONS,
  THEMES,
  UNIT_SYSTEMS,
  VISIBILITIES,
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
    seasons: z.array(z.enum(SEASONS)).max(4).transform((s) => [...new Set(s)]),
    category: z.enum(RECIPE_CATEGORIES).nullable(),
    ovenTemperatureC: z.number().int().min(LIMITS.ovenMinC).max(LIMITS.ovenMaxC).nullable(),
    ovenMode: z.enum(OVEN_MODES).nullable(),
    notes: optText(LIMITS.longText),
    tips: optText(LIMITS.longText),
    extraInfo: optText(LIMITS.longText),
    source: optText(LIMITS.source),
    sourceUrl: z.url({ protocol: /^https?$/ }).max(LIMITS.url).nullable(),
    tags: z.array(tag).max(LIMITS.tags).transform((t) => [...new Set(t.map((x) => x.toLowerCase()))]),
    visibility: z.enum(VISIBILITIES),
    ingredients: z.array(ingredientSchema).max(LIMITS.ingredients),
    steps: z.array(stepSchema).max(LIMITS.steps),
    originRecipeId: uuid().nullable(),
    householdId: uuid().nullable(),
  })
  .strict();
export type RecipeData = z.infer<typeof recipeDataSchema>;
export type RecipeInput = z.input<typeof recipeDataSchema>;

export const favoriteDataSchema = z.object({ recipeId: uuid(), householdId: uuid().nullable() }).strict();
export const collectionDataSchema = z
  .object({
    name: reqText(LIMITS.collectionName),
    emoji: z.string().max(16).nullable(),
    position: z.number().int().min(0).max(100000),
    householdId: uuid().nullable(),
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
    householdId: uuid().nullable(),
  })
  .strict()
  .refine((d) => d.recipeId !== null || d.customTitle !== null, { message: 'recipe_or_title_required' });

export const shoppingListDataSchema = z
  .object({
    name: reqText(LIMITS.listName),
    emoji: z.string().max(16).nullable(),
    archived: z.boolean(),
    householdId: uuid().nullable(),
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

export const notificationPrefsSchema = z.object(
  Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, z.boolean()])) as Record<
    (typeof NOTIFICATION_CATEGORIES)[number],
    z.ZodBoolean
  >,
);

export const settingsDataSchema = z
  .object({
    theme: z.enum(THEMES),
    locale: z.enum(LOCALES).nullable(),
    unitSystem: z.enum(UNIT_SYSTEMS),
    activeShoppingListId: uuid().nullable(),
    notifications: notificationPrefsSchema,
    dinnerReminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    hapticsEnabled: z.boolean(),
    analyticsConsent: z.boolean().nullable(),
    defaultServings: z.number().int().min(1).max(LIMITS.servingsMax),
    onboardingDone: z.boolean(),
  })
  .strict();
export type SettingsData = z.infer<typeof settingsDataSchema>;

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  locale: null,
  unitSystem: 'metric',
  activeShoppingListId: null,
  notifications: { mealReminder: true, shoppingReady: true, planningNudge: true, timers: true, household: true },
  dinnerReminderTime: '17:30',
  hapticsEnabled: true,
  analyticsConsent: null,
  defaultServings: 4,
  onboardingDone: false,
};

// ---------- auth / account ----------
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);
export const displayNameSchema = reqText(LIMITS.displayName);

export const contactSchema = z
  .object({
    email: emailSchema.nullable(),
    subject: reqText(120),
    message: reqText(LIMITS.contactMessage),
  })
  .strict();
