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

export const VISIBILITIES = ['private', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

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

export const LOCALES = ['fr', 'en', 'es', 'de', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const REPORT_REASONS = ['spam', 'inappropriate', 'copyright', 'dangerous', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const CONTACT_STATUSES = ['new', 'read', 'answered', 'closed'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const HOUSEHOLD_ROLES = ['owner', 'member'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const NOTIFICATION_CATEGORIES = ['mealReminder', 'shoppingReady', 'planningNudge', 'timers', 'household'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
