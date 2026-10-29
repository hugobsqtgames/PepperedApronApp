import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  emptyMainSlots,
  leftoverSlot,
  mealsFromTemplate,
  templateFromWeek,
  monthGrid,
  nextMeal,
  nextPosition,
  sortEntries,
  startOfWeek,
  weekDates,
} from './planning';
import {
  addTime,
  createTimer,
  pauseTimer,
  remainingSeconds,
  resumeTimer,
  timerState,
} from './timers';

describe('planning dates', () => {
  it('week starts on Monday, handles month/year boundaries and DST', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28');
    expect(startOfWeek('2026-09-27', 0)).toBe('2026-09-27');
    expect(weekDates('2026-10-19')).toContain('2026-10-25');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('month grid is 6x7 and starts on week start', () => {
    const g = monthGrid('2026-02-14');
    expect(g).toHaveLength(6);
    expect(g[0]![0]).toBe('2026-01-26');
    expect(g.flat()).toContain('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
  });
  it('sorts entries and computes next position', () => {
    const e = [
      { id: 'a', date: '2026-09-22', slot: 'dinner' as const, position: 0 },
      { id: 'b', date: '2026-09-22', slot: 'breakfast' as const, position: 0 },
      { id: 'c', date: '2026-09-21', slot: 'dinner' as const, position: 1 },
      { id: 'd', date: '2026-09-21', slot: 'dinner' as const, position: 0 },
    ];
    expect(sortEntries(e).map((x) => x.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(nextPosition(e, '2026-09-21', 'dinner')).toBe(2);
    expect(nextPosition(e, '2026-09-23', 'lunch')).toBe(0);
    expect(emptyMainSlots(e, '2026-09-21')).toBe(12);
    expect(nextMeal(e, new Date(2026, 8, 21, 21, 0))!.id).toBe('b');
    expect(nextMeal(e, new Date(2026, 8, 21, 18, 0))!.id).toBe('d');
    expect(nextMeal(e, new Date(2026, 9, 1))).toBeNull();
  });
});

describe('timers', () => {
  it('runs, pauses, resumes, extends and completes', () => {
    let t = createTimer({ id: 't', label: 'Poulet', durationSeconds: 25 * 60 }, 0);
    expect(timerState(t, 0)).toBe('running');
    expect(remainingSeconds(t, 60_000)).toBe(24 * 60);
    t = pauseTimer(t, 60_000);
    expect(timerState(t, 10 ** 9)).toBe('paused');
    expect(remainingSeconds(t, 10 ** 9)).toBe(24 * 60);
    t = resumeTimer(t, 100_000);
    expect(remainingSeconds(t, 100_000)).toBe(24 * 60);
    t = addTime(t, 60, 100_000);
    expect(remainingSeconds(t, 100_000)).toBe(25 * 60);
    expect(timerState(t, 100_000 + 25 * 60_000)).toBe('done');
    expect(remainingSeconds(t, 10 ** 12)).toBe(0);
    expect(pauseTimer(t, 10 ** 12)).toBe(t);
  });
});

describe('leftovers and reusable weeks', () => {
  it('leftovers go to the next day lunch', () => {
    expect(leftoverSlot('2026-10-29')).toEqual({ date: '2026-10-30', slot: 'lunch' });
  });
  it('a week becomes a template and back', () => {
    const meals = templateFromWeek(
      [
        {
          date: '2026-10-28',
          slot: 'dinner' as const,
          recipeId: 'r1',
          customTitle: null,
          servings: 4,
          leftover: false,
        },
        {
          date: '2026-10-26',
          slot: 'lunch' as const,
          recipeId: null,
          customTitle: 'Pizza',
          servings: null,
          leftover: false,
        },
        {
          date: '2026-11-03',
          slot: 'lunch' as const,
          recipeId: null,
          customTitle: 'Hors semaine',
          servings: null,
          leftover: false,
        },
      ],
      '2026-10-26',
    );
    expect(meals.map((m) => [m.day, m.slot])).toEqual([
      [0, 'lunch'],
      [2, 'dinner'],
    ]);
    expect(mealsFromTemplate(meals, '2026-11-09').map((m) => m.date)).toEqual([
      '2026-11-09',
      '2026-11-11',
    ]);
  });
});
