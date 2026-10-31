import { requireOptionalNativeModule } from 'expo';

/**
 * Spotlight (recipes searchable from the iPhone's search, indexed on the device) and Handoff
 * (continue the recipe or the cook mode on the other device). No-ops where the module is absent.
 */
export interface SpotlightRecipe {
  id: string;
  title: string;
  details: string;
  keywords: string[];
  image?: string;
}

interface IosIntegrationNative {
  indexRecipes(recipes: SpotlightRecipe[]): Promise<number>;
  clearIndex(): Promise<void>;
  setActivity(type: 'recipe' | 'cook', title: string, url: string): void;
  clearActivity(): void;
}

const native = requireOptionalNativeModule<IosIntegrationNative>('IosIntegration');

export const indexRecipes = (r: SpotlightRecipe[]) => native?.indexRecipes(r) ?? Promise.resolve(0);
export const clearSpotlight = () => native?.clearIndex() ?? Promise.resolve();
export const setActivity = (type: 'recipe' | 'cook', title: string, url: string) => {
  try {
    native?.setActivity(type, title, url);
  } catch {
    // Handoff is a bonus: never a reason to fail.
  }
};
export const clearActivity = () => {
  try {
    native?.clearActivity();
  } catch {
    // Same.
  }
};
