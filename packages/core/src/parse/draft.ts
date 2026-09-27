import type { Difficulty, RecipeCategory } from '../enums';

export interface DraftIngredient {
  group: string | null;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  note: string | null;
}

export interface DraftStep {
  group: string | null;
  text: string;
  timerSeconds: number | null;
  timerLabel: string | null;
}

/** Output of every importer (text, JSON-LD, OCR). The user always reviews it before saving. */
export interface RecipeDraft {
  title: string | null;
  description: string | null;
  servings: number | null;
  yieldLabel: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  totalMinutes: number | null;
  ovenTemperatureC: number | null;
  difficulty: Difficulty | null;
  category: RecipeCategory | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  tips: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  author: string | null;
  /** Lines the parser could not classify, kept so nothing the user pasted is lost. */
  unparsed: string[];
}

export function emptyDraft(): RecipeDraft {
  return {
    title: null,
    description: null,
    servings: null,
    yieldLabel: null,
    prepMinutes: null,
    cookMinutes: null,
    restMinutes: null,
    totalMinutes: null,
    ovenTemperatureC: null,
    difficulty: null,
    category: null,
    ingredients: [],
    steps: [],
    tips: null,
    notes: null,
    tags: [],
    source: null,
    sourceUrl: null,
    imageUrl: null,
    author: null,
    unparsed: [],
  };
}
