import type { ImageSourcePropType } from 'react-native';
import type { RecipeCategory } from '@pepperedapron/core';

/** Real food photography for each category (Unsplash License, see docs/brand/PHOTO_CREDITS.md). */
export const CATEGORY_PHOTOS: Record<RecipeCategory, ImageSourcePropType> = {
  breakfast: require('../../assets/photos/breakfast.jpg'),
  appetizer: require('../../assets/photos/appetizer.jpg'),
  starter: require('../../assets/photos/starter.jpg'),
  soup: require('../../assets/photos/soup.jpg'),
  salad: require('../../assets/photos/salad.jpg'),
  main: require('../../assets/photos/main.jpg'),
  pasta: require('../../assets/photos/pasta.jpg'),
  meat: require('../../assets/photos/meat.jpg'),
  fish: require('../../assets/photos/fish.jpg'),
  vegetarian: require('../../assets/photos/vegetarian.jpg'),
  side: require('../../assets/photos/side.jpg'),
  sauce: require('../../assets/photos/sauce.jpg'),
  baking: require('../../assets/photos/baking.jpg'),
  dessert: require('../../assets/photos/dessert.jpg'),
  snack: require('../../assets/photos/snack.jpg'),
  drinks: require('../../assets/photos/drinks.jpg'),
};

export const CATEGORY_EMOJI: Record<RecipeCategory, string> = {
  breakfast: '🥐', appetizer: '🫒', starter: '🥗', soup: '🍲', salad: '🥬', main: '🍽️', pasta: '🍝', meat: '🥩',
  fish: '🐟', vegetarian: '🥕', side: '🥔', sauce: '🥫', baking: '🥖', dessert: '🍰', snack: '🍪', drinks: '🍹',
};

/** Order used on the home screen (most common first). */
export const HOME_CATEGORIES: RecipeCategory[] = ['main', 'pasta', 'dessert', 'soup', 'salad', 'vegetarian', 'fish', 'meat', 'breakfast', 'baking', 'starter', 'appetizer', 'side', 'snack', 'sauce', 'drinks'];

export const ONBOARDING_PHOTOS = {
  recipes: require('../../assets/photos/onboarding-recipes.jpg'),
  planning: require('../../assets/photos/onboarding-planning.jpg'),
  shopping: require('../../assets/photos/onboarding-shopping.jpg'),
  import: require('../../assets/photos/onboarding-import.jpg'),
};
