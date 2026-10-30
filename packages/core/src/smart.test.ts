import { describe, expect, it } from 'vitest';
import {
  EMPTY_SMART_RULES,
  matchesSmartRules,
  smartRulesSchema,
  type SmartCandidate,
} from './smart';

const r = (p: Partial<SmartCandidate>): SmartCandidate => ({
  diets: [],
  totalMinutes: null,
  category: null,
  seasons: [],
  rating: null,
  lastCooked: null,
  ...p,
});
const today = '2026-10-30';
const m = (c: SmartCandidate, rules: Partial<typeof EMPTY_SMART_RULES>) =>
  matchesSmartRules(c, { ...EMPTY_SMART_RULES, ...rules }, today);

describe('smart collections', () => {
  it('applies every rule', () => {
    const soup = r({
      diets: ['vegetarian'],
      totalMinutes: 25,
      category: 'soup',
      seasons: ['autumn'],
      rating: 5,
      lastCooked: '2026-07-01',
    });
    expect(m(soup, {})).toBe(true);
    expect(m(soup, { diet: 'vegetarian', maxMinutes: 30, categories: ['soup', 'main'] })).toBe(
      true,
    );
    expect(m(soup, { diet: 'vegan' })).toBe(false);
    expect(m(soup, { maxMinutes: 20 })).toBe(false);
    expect(m(r({}), { maxMinutes: 20 })).toBe(false);
    expect(m(soup, { season: 'summer' })).toBe(false);
    expect(m(r({}), { season: 'summer' })).toBe(true);
    expect(m(soup, { minRating: 4 })).toBe(true);
    expect(m(r({ rating: 3 }), { minRating: 4 })).toBe(false);
    expect(m(soup, { notCookedDays: 60 })).toBe(true);
    expect(m(r({ lastCooked: '2026-10-20' }), { notCookedDays: 60 })).toBe(false);
    expect(m(r({}), { notCookedDays: 60 })).toBe(true);
  });

  it('fills missing rules with defaults (older data)', () => {
    expect(smartRulesSchema.parse({ diet: 'vegan' })).toEqual({
      ...EMPTY_SMART_RULES,
      diet: 'vegan',
    });
  });
});
