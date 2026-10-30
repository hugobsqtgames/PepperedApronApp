/** Property tests of the cooking, planning, shopping, pantry and search logic. */
import { afterAll, describe, expect, it } from 'vitest';
import { getUnit, UNITS } from '../units';
import { convertAmount, formatAmount, normalizeAmount, scaleAmount } from '../quantity';
import {
  roundForCooking,
  scaleStepText,
  findMoldSize,
  scaleMold,
  convertUnits,
  CONVERTER_UNITS,
} from '../cooking';
import {
  addDays,
  fromIsoDate,
  startOfWeek,
  toIsoDate,
  weekDates,
  addMonths,
  monthGrid,
} from '../planning';
import {
  parseIsoDuration,
  parseDurationText,
  parseTimerSeconds,
  formatClock,
  formatMinutes,
} from '../duration';
import {
  mergeShoppingLines,
  shoppingLinesFromPlan,
  planMergeIntoList,
  categorizeIngredient,
} from '../shopping';
import { deductPantry, expiringSoon, weekSummary } from '../pantry';
import { searchRecipes, EMPTY_FILTERS, parseSearchQuery, type SearchableRecipe } from '../search';
import { EMPTY_SMART_RULES, matchesSmartRules, type SmartRules } from '../smart';
import { detectStepTimer, stepIngredients, voiceCommand } from '../steps';
import { budgetSummary, estimateLinePrice, parsePrice } from '../budget';
import { canonicalUrl, findDuplicate } from '../duplicates';
import { dietTags } from '../diet';
import { ingredientSeasons } from '../seasonal';
import { RECIPE_CATEGORIES, SEASONS } from '../enums';
import { casesRun, rng } from './rng';

const N = 500;
const MASS = UNITS.filter((u) => u.dimension === 'mass' || u.dimension === 'volume').map(
  (u) => u.key,
);
const base = (q: number, unit: string) => q * getUnit(unit)!.toBase;

describe('quantities', () => {
  it(`${N} amounts: scaling there and back, normalising and converting keep the quantity`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(10_000 + s);
      const unit = r.pick(MASS);
      const q = r.int(1, 50_000) / r.pick([1, 10, 100]);
      const f = r.pick([0.25, 0.5, 1.5, 2, 3, 10 / 4]);
      const a = { quantity: q, quantityMax: null, unit };
      const back = scaleAmount(scaleAmount(a, f), 1 / f);
      expect(back.quantity!, `seed ${s}`).toBeCloseTo(q, 6);
      const n = normalizeAmount(a);
      expect(base(n.quantity!, n.unit!), `seed ${s}`).toBeCloseTo(base(q, unit), 4);
      expect(getUnit(n.unit)!.dimension, `seed ${s}`).toBe(getUnit(unit)!.dimension);
      const imp = convertAmount(a, 'imperial');
      const met = convertAmount(imp, 'metric');
      expect(base(met.quantity!, met.unit!) / base(q, unit), `seed ${s}`).toBeCloseTo(1, 2);
      for (const l of ['fr', 'en'] as const)
        expect(formatAmount(n, l).length, `seed ${s}`).toBeGreaterThan(0);
    }
  });

  it(`${N} cook roundings stay positive and close to the exact quantity`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(11_000 + s);
      const q = r.int(1, 4000) / r.pick([1, 3, 7, 10]);
      const unit = r.pick([null, 'g', 'tbsp', 'tsp', 'cup', 'ml', 'pinch']);
      const res = roundForCooking(
        { quantity: q, quantityMax: null, unit },
        r.pick(['œufs', 'oignon', 'farine', 'sel', 'beurre']),
      );
      expect(res.quantity!, `seed ${s}`).toBeGreaterThan(0);
      expect(Number.isFinite(res.quantity!), `seed ${s}`).toBe(true);
    }
  });

  it(`${N} step texts: scaling by 1 changes nothing, other factors never throw`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(12_000 + s);
      const text = r.junk(20);
      expect(scaleStepText(text, 1, 'fr'), `seed ${s}`).toBe(text);
      scaleStepText(text, r.pick([0.5, 2, 3.3]), r.pick(['fr', 'en']));
      const m = findMoldSize([text, `moule de ${r.int(10, 40)} cm`]);
      if (m) {
        const sc = scaleMold(m, r.pick([0.5, 1, 2]));
        if (sc && sc.shape === 'round') expect(sc.diameter, `seed ${s}`).toBeGreaterThan(0);
      }
    }
  });

  it(`${N} conversions between converter units are reversible`, () => {
    const keys = Object.values(CONVERTER_UNITS).flat() as string[];
    for (let s = 1; s <= N; s++) {
      const r = rng(13_000 + s);
      const from = r.pick(keys);
      const to = r.pick(keys);
      const v = r.int(1, 1000);
      const out = convertUnits(v, from as never, to as never, null);
      if (out === null) continue;
      const back = convertUnits(out, to as never, from as never, null);
      if (back !== null) expect(back, `seed ${s}: ${v} ${from}→${to}`).toBeCloseTo(v, 3);
    }
  });
});

describe('dates and durations', () => {
  it(`${N} dates: weeks start on Monday, add/subtract days is reversible`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(14_000 + s);
      const d = toIsoDate(new Date(r.int(1990, 2090), r.int(0, 11), r.int(1, 28)));
      const n = r.int(-800, 800);
      expect(addDays(addDays(d, n), -n), `seed ${s}`).toBe(d);
      const ws = startOfWeek(d);
      expect(fromIsoDate(ws).getDay(), `seed ${s}`).toBe(1);
      expect(ws <= d && addDays(ws, 6) >= d, `seed ${s}`).toBe(true);
      expect(weekDates(ws), `seed ${s}`).toHaveLength(7);
      expect(fromIsoDate(d).getTime(), `seed ${s}`).toBe(
        fromIsoDate(toIsoDate(fromIsoDate(d))).getTime(),
      );
      const grid = monthGrid(d);
      expect(grid.flat(), `seed ${s}`).toContain(d);
      // addMonths moves between months for the calendar: it lands on the 1st.
      expect(addMonths(d, 0), `seed ${s}`).toBe(`${d.slice(0, 7)}-01`);
      expect(addMonths(addMonths(d, 5), -5), `seed ${s}`).toBe(`${d.slice(0, 7)}-01`);
    }
  });

  it(`${N} durations: ISO 8601 read exactly, free text never throws`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(15_000 + s);
      const h = r.int(0, 30);
      const m = r.int(0, 59);
      const iso = `PT${h ? `${h}H` : ''}${m || !h ? `${m}M` : ''}`;
      expect(parseIsoDuration(iso), `seed ${s}: ${iso}`).toBe(h * 60 + m);
      const t = r.junk(10);
      const mins = parseDurationText(t);
      if (mins !== null) expect(mins, `seed ${s}`).toBeGreaterThanOrEqual(0);
      const sec = parseTimerSeconds(t);
      if (sec !== null) expect(sec, `seed ${s}`).toBeGreaterThanOrEqual(0);
      const secs = r.int(0, 200_000);
      expect(formatClock(secs), `seed ${s}`).toMatch(/^\d+:\d\d(:\d\d)?$/);
      formatMinutes(r.int(0, 5000), r.pick(['fr', 'en']));
    }
  });
});

describe('shopping and pantry', () => {
  const line = (r: ReturnType<typeof rng>) => ({
    name: r.pick(['farine', 'Farine', 'lait', 'œufs', 'oeuf', 'riz', 'tomates', 'sel', r.word()]),
    quantity: r.bool(0.8) ? r.int(1, 2000) / r.pick([1, 10]) : null,
    unit: r.pick([null, 'g', 'kg', 'ml', 'l', 'cl', 'tbsp', 'piece']),
    recipeIds: [`r${r.int(1, 5)}`],
  });

  it(`${N} lists: merging keeps the total of each ingredient and never duplicates`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(16_000 + s);
      const lines = Array.from({ length: r.int(0, 25) }, () => line(r));
      const merged = mergeShoppingLines(lines);
      const total = (ls: typeof lines, kind: 'mass' | 'volume') =>
        ls.reduce((t, l) => {
          const u = getUnit(l.unit);
          return u?.dimension === kind && l.quantity !== null ? t + l.quantity * u.toBase : t;
        }, 0);
      for (const k of ['mass', 'volume'] as const)
        expect(total(merged, k), `seed ${s}`).toBeCloseTo(total(lines, k), 3);
      expect(merged.length, `seed ${s}`).toBeLessThanOrEqual(lines.length);
      const ids = new Set(lines.flatMap((l) => l.recipeIds));
      for (const m of merged)
        for (const id of m.recipeIds) expect(ids.has(id), `seed ${s}`).toBe(true);
      // The same plan merged into a list twice: the second time only updates.
      const existing = merged.map((m, i) => ({
        ...m,
        id: String(i),
        categoryKey: categorizeIngredient(m.name),
        checked: false,
      }));
      for (const p of planMergeIntoList(existing, merged))
        expect(p.kind, `seed ${s}`).toBe('update');
    }
  });

  it(`${N} plans: lines follow the planned servings`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(17_000 + s);
      const servings = r.int(1, 12);
      const planned = r.int(1, 12);
      const q = r.int(1, 1000);
      const out = shoppingLinesFromPlan(
        [
          {
            recipeId: 'a',
            recipeServings: servings,
            plannedServings: planned,
            ingredients: [{ name: 'farine', quantity: q, quantityMax: null, unit: 'g' }],
          },
        ],
        4,
      );
      expect(out, `seed ${s}`).toHaveLength(1);
      expect(base(out[0]!.quantity!, out[0]!.unit!), `seed ${s}`).toBeCloseTo(
        (q * planned) / servings,
        3,
      );
    }
  });

  it(`${N} pantries: never buy more than needed, never lose an ingredient`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(18_000 + s);
      const lines = mergeShoppingLines(Array.from({ length: r.int(0, 15) }, () => line(r)));
      const pantry = Array.from({ length: r.int(0, 10) }, () => {
        const l = line(r);
        return { name: l.name, quantity: l.quantity, unit: l.unit };
      });
      const { lines: out, skipped } = deductPantry(lines, pantry);
      // Each line is handled on its own: the whole list gives the lines one by one would.
      const one = lines.map((l) => deductPantry([l], pantry));
      expect(out, `seed ${s}`).toEqual(one.flatMap((x) => x.lines));
      expect(skipped, `seed ${s}`).toEqual(one.flatMap((x) => x.skipped));
      lines.forEach((l, k) => {
        const o = one[k]!.lines[0];
        if (!o) return;
        expect(o.name, `seed ${s}`).toBe(l.name);
        if (o.quantity !== null) expect(o.quantity, `seed ${s}`).toBeGreaterThan(0);
        if (o.quantity !== null && l.quantity !== null && getUnit(o.unit) && getUnit(l.unit))
          expect(base(o.quantity, o.unit!), `seed ${s}`).toBeLessThanOrEqual(
            base(l.quantity, l.unit!) + 1e-6,
          );
      });
      expect(deductPantry(lines, []).lines, `seed ${s}`).toEqual(lines);
      const items = pantry.map((p, i) => ({
        ...p,
        expiresOn: r.bool() ? addDays('2026-10-30', r.int(-5, 10)) : null,
        i,
      }));
      const soon = expiringSoon(items, '2026-10-30', 3);
      for (let k = 1; k < soon.length; k++)
        expect(soon[k - 1]!.expiresOn! <= soon[k]!.expiresOn!, `seed ${s}`).toBe(true);
      for (const x of soon) expect(x.expiresOn! <= '2026-11-02', `seed ${s}`).toBe(true);
    }
  });

  it(`${N} weeks: the summary is consistent with its inputs`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(19_000 + s);
      const start = '2026-10-26';
      const entries = Array.from({ length: r.int(0, 20) }, () => ({
        date: addDays(start, r.int(-3, 10)),
        recipeId: r.bool(0.8) ? `r${r.int(1, 6)}` : null,
        leftover: r.bool(0.2),
      }));
      const logs = Array.from({ length: r.int(0, 20) }, () => ({
        recipeId: `r${r.int(1, 6)}`,
        date: addDays(start, r.int(-60, 10)),
      }));
      const items = Array.from({ length: r.int(0, 20) }, () => ({
        price: r.bool() ? r.int(0, 2000) / 100 : null,
        recipeIds: [`r${r.int(1, 8)}`],
      }));
      const w = weekSummary({
        start,
        end: addDays(start, 6),
        entries,
        logs,
        items,
        recipeIngredients: (id) => (id === 'r6' ? null : id === 'r1' ? ['poulet'] : ['tomate']),
      });
      expect(w.planned, `seed ${s}`).toBe(
        entries.filter((e) => e.date >= start && e.date <= addDays(start, 6)).length,
      );
      if (w.vegetarianShare !== null)
        expect(w.vegetarianShare >= 0 && w.vegetarianShare <= 1, `seed ${s}`).toBe(true);
      if (w.budget !== null) expect(w.budget, `seed ${s}`).toBeGreaterThanOrEqual(0);
      expect(w.favorites.length, `seed ${s}`).toBeLessThanOrEqual(3);
      const b = budgetSummary(items.map((i) => ({ price: i.price, checked: r.bool() })));
      expect(Number.isFinite(b.total), `seed ${s}`).toBe(true);
    }
  });

  it(`${N} prices: parsing and estimating never give negative or infinite amounts`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(20_000 + s);
      const p = parsePrice(r.junk(4));
      if (p !== null) expect(p >= 0 && Number.isFinite(p), `seed ${s}`).toBe(true);
      const e = estimateLinePrice(
        { quantity: r.bool() ? r.int(0, 3000) : null, unit: r.pick([null, 'g', 'kg', 'l']) },
        {
          price: r.int(0, 999) / 10,
          quantity: r.bool() ? r.int(1, 1000) : null,
          unit: r.pick([null, 'g', 'kg', 'l']),
        },
      );
      if (e !== null) expect(e >= 0 && Number.isFinite(e), `seed ${s}`).toBe(true);
    }
  });
});

describe('search, rules and steps', () => {
  const recipe = (r: ReturnType<typeof rng>, i: number): SearchableRecipe => ({
    id: String(i),
    title: r.bool()
      ? r.junk(5)
      : r.pick(['Poulet rôti', 'Tarte aux pommes', 'Soupe', 'Pâtes au citron']),
    description: r.bool() ? r.junk(10) : null,
    category: r.bool() ? r.pick(RECIPE_CATEGORIES) : null,
    tags: Array.from({ length: r.int(0, 3) }, () => r.word()),
    difficulty: r.pick([null, 'easy', 'medium', 'hard'] as const),
    seasons: r.bool() ? [r.pick(SEASONS)] : [],
    totalMinutes: r.bool() ? r.int(1, 300) : null,
    ingredientNames: Array.from({ length: r.int(0, 8) }, () =>
      r.pick(['poulet', 'citron', 'farine', r.word()]),
    ),
    updatedAt: `2026-0${r.int(1, 9)}-1${r.int(0, 9)}`,
    diets: dietTags([]),
    notes: r.bool() ? r.junk(10) : undefined,
  });

  it(`${N} libraries × queries: results come from the library, best first, filters respected`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(21_000 + s);
      const lib = Array.from({ length: r.int(0, 30) }, (_, i) => recipe(r, i));
      const q = r.pick([
        () => r.junk(4),
        () => 'poulet rapide',
        () => 'moins de 30 minutes',
        () => 'sans citron',
        () => '',
      ])();
      const maxMinutes = r.bool(0.3) ? r.int(5, 120) : null;
      const res = searchRecipes(lib, q, {
        ...EMPTY_FILTERS,
        maxMinutes,
        fridge: r.bool(0.2) ? ['citron'] : [],
      });
      const ids = new Set(lib.map((x) => x.id));
      for (let k = 0; k < res.length; k++) {
        expect(ids.has(res[k]!.recipe.id), `seed ${s}`).toBe(true);
        if (k) expect(res[k - 1]!.score, `seed ${s}`).toBeGreaterThanOrEqual(res[k]!.score);
        if (maxMinutes !== null)
          expect(res[k]!.recipe.totalMinutes! <= maxMinutes, `seed ${s}`).toBe(true);
      }
      expect(new Set(res.map((x) => x.recipe.id)).size, `seed ${s}`).toBe(res.length);
      parseSearchQuery(r.junk(8));
    }
  });

  it(`${N} recipes × rules: smart collections match a reference implementation`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(22_000 + s);
      const c = {
        diets: r.bool() ? (['vegetarian'] as const).slice() : [],
        totalMinutes: r.bool() ? r.int(1, 200) : null,
        category: r.bool() ? r.pick(RECIPE_CATEGORIES) : null,
        seasons: r.bool() ? [r.pick(SEASONS)] : [],
        rating: r.bool() ? r.int(1, 5) : null,
        lastCooked: r.bool() ? addDays('2026-10-30', -r.int(0, 400)) : null,
      };
      const rules: SmartRules = {
        ...EMPTY_SMART_RULES,
        diet: r.bool(0.3) ? 'vegetarian' : null,
        maxMinutes: r.bool(0.3) ? r.int(10, 120) : null,
        categories: r.bool(0.3) ? [r.pick(RECIPE_CATEGORIES)] : [],
        season: r.bool(0.3) ? r.pick(SEASONS) : null,
        minRating: r.bool(0.3) ? r.int(1, 5) : null,
        notCookedDays: r.bool(0.3) ? r.int(1, 365) : null,
      };
      const days = (d: string) =>
        (fromIsoDate('2026-10-30').getTime() - fromIsoDate(d).getTime()) / 86_400_000;
      const expected =
        (!rules.diet || c.diets.includes(rules.diet as never)) &&
        (rules.maxMinutes === null ||
          (c.totalMinutes !== null && c.totalMinutes <= rules.maxMinutes)) &&
        (!rules.categories.length ||
          (c.category !== null && rules.categories.includes(c.category))) &&
        (!rules.season || !c.seasons.length || c.seasons.includes(rules.season)) &&
        (rules.minRating === null || (c.rating ?? 0) >= rules.minRating) &&
        (rules.notCookedDays === null ||
          !c.lastCooked ||
          days(c.lastCooked) >= rules.notCookedDays);
      expect(
        matchesSmartRules(c as never, rules, '2026-10-30'),
        `seed ${s}: ${JSON.stringify({ c, rules })}`,
      ).toBe(expected);
    }
  });

  it(`${N} steps: ingredients come from the list, timers stay in range, commands never throw`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(23_000 + s);
      const ings = Array.from({ length: r.int(0, 10) }, () => ({
        name: r.bool() ? r.word() : r.pick(['ail', 'oignons', 'crème fraîche', 'sel']),
      }));
      const text = r.junk(15);
      const used = stepIngredients(text, ings);
      for (const u of used) expect(ings.includes(u), `seed ${s}`).toBe(true);
      const t = detectStepTimer({ text, timerSeconds: null });
      if (t !== null) expect(t >= 10 && t <= 86_400, `seed ${s}`).toBe(true);
      const cmd = voiceCommand(text);
      expect(
        [null, 'next', 'previous', 'repeat', 'timer', 'ingredients', 'stop'],
        `seed ${s}`,
      ).toContain(cmd);
      dietTags(ings.map((i) => i.name));
      ingredientSeasons(r.word());
    }
  });

  it(`${N} links and titles: duplicates found by link whatever the tracking parameters`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(24_000 + s);
      const path = `/recette/${r.word(6).replace(/ /g, '-')}`;
      const a = `https://www.site.fr${path}`;
      const b = `https://site.fr${path}${r.bool() ? '/' : ''}?utm_source=${r.word(4)}${r.bool() ? '#x' : ''}`;
      expect(canonicalUrl(a), `seed ${s}: ${b}`).toBe(canonicalUrl(b));
      const m = findDuplicate({ title: '', sourceUrl: b, ingredientNames: [] }, [
        { id: 'x', title: r.word(), sourceUrl: a, ingredientNames: [] },
      ]);
      expect(m?.id, `seed ${s}`).toBe('x');
      canonicalUrl(r.junk(6));
    }
  });
});

afterAll(() => console.info(`QA-COUNT core.fuzz.logic.cases ${casesRun()}`));
