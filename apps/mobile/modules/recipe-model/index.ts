import { requireOptionalNativeModule } from 'expo';
import type { ModelRecipe } from '@pepperedapron/core';

/**
 * Apple's language model on the iPhone (Foundation Models: iOS 26+, Apple Intelligence on).
 * Nothing is sent anywhere. Missing on older iPhones, in Expo Go and in builds made before this
 * module: the app then puts the video's sources together without it.
 */
interface RecipeModelNative {
  availability(): Promise<string>;
  structure(instructions: string, prompt: string): Promise<ModelRecipe>;
}

const native = requireOptionalNativeModule<RecipeModelNative>('RecipeModel');

/** "available", or why not ("unavailable:deviceNotEligible", "unavailable:os"…). */
export async function recipeModelAvailability(): Promise<string> {
  if (!native) return 'unavailable:module';
  try {
    return await native.availability();
  } catch {
    return 'unavailable:error';
  }
}

export function structureRecipe(instructions: string, prompt: string): Promise<ModelRecipe> {
  if (!native)
    return Promise.reject(Object.assign(new Error('unsupported'), { code: 'ERR_UNAVAILABLE' }));
  return native.structure(instructions, prompt);
}
