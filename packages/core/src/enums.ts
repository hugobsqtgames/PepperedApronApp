export const RECIPE_CATEGORIES = [
  'breakfast',
  'appetizer',
  'starter',
  'soup',
  'salad',
  'main',
  'pasta',
  'meat',
  'fish',
  'vegetarian',
  'side',
  'sauce',
  'baking',
  'dessert',
  'snack',
  'drinks',
] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const OVEN_MODES = ['conventional', 'fan', 'grill'] as const;
export type OvenMode = (typeof OVEN_MODES)[number];

/** Built-in store aisles, in a typical French supermarket walking order. */
export const SHOPPING_CATEGORIES = [
  'produce',
  'bakery',
  'meat_fish',
  'dairy_eggs',
  'pantry',
  'condiments',
  'sweets_breakfast',
  'frozen',
  'drinks',
  'household',
  'other',
] as const;
export type ShoppingCategoryKey = (typeof SHOPPING_CATEGORIES)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const NOTIFICATION_CATEGORIES = [
  'mealReminder',
  'shoppingReady',
  'planningNudge',
  'timers',
  'expiry',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** What the user should check in a recipe saved straight from the share sheet. */
export const REVIEW_NOTICES = [
  'full',
  'partial',
  'minimal',
  'instagram',
  'speech',
  'listenPermission',
  'listenLanguage',
  'listenFailed',
  'text',
  'photo',
  'dictation',
] as const;
export type ReviewNotice = (typeof REVIEW_NOTICES)[number];
