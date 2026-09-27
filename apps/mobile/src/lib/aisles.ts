import type { TFunction } from 'i18next';
import { SHOPPING_CATEGORIES } from '@pepperedapron/core';

export function aisleName(key: string, custom: Map<string, string | null>, t: TFunction): string {
  const name = custom.get(key);
  if (name) return name;
  if ((SHOPPING_CATEGORIES as readonly string[]).includes(key))
    return t(`aisles.${key as (typeof SHOPPING_CATEGORIES)[number]}`);
  return t('aisles.other');
}
