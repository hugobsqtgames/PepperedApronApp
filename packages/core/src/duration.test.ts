import { describe, expect, it } from 'vitest';
import { computeTotalMinutes, formatClock, formatMinutes, parseDurationText, parseIsoDuration, parseTimerSeconds } from './duration';

describe('durations', () => {
  it.each([['PT30M', 30], ['PT1H30M', 90], ['P0DT0H45M', 45], ['PT2H', 120], ['P1D', 1440], ['PT90S', 2], ['PT', null], ['garbage', null], ['', null]])(
    'iso %s', (s, v) => expect(parseIsoDuration(s)).toBe(v),
  );
  it.each([
    ['1 h 30', 90], ['1h30', 90], ['90 min', 90], ['1 heure 15 minutes', 75], ['2 heures', 120], ['45 minutes', 45], ['2 Std.', 120], ['1 ora', 60], ["20'", 20], ['1,5 h', 90], ['pas de durée', null], ['250 ml', null],
  ])('text %s', (s, v) => expect(parseDurationText(s)).toBe(v));
  it('timer seconds keeps seconds precision', () => {
    expect(parseTimerSeconds('cuire 30 secondes')).toBe(30);
    expect(parseTimerSeconds('cuire 10 min')).toBe(600);
    expect(parseTimerSeconds('rien')).toBeNull();
  });
  it('formats', () => {
    expect(formatMinutes(90, 'fr')).toBe('1 h 30');
    expect(formatMinutes(60, 'en')).toBe('1 h');
    expect(formatMinutes(45, 'de')).toBe('45 min');
    expect(formatMinutes(null, 'fr')).toBe('');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('00:00');
  });
  it('total time', () => {
    expect(computeTotalMinutes({ prepMinutes: 10, cookMinutes: 20, restMinutes: null, totalMinutes: null })).toBe(30);
    expect(computeTotalMinutes({ prepMinutes: 10, cookMinutes: 20, restMinutes: null, totalMinutes: 45 })).toBe(45);
    expect(computeTotalMinutes({ prepMinutes: null, cookMinutes: null, restMinutes: null, totalMinutes: null })).toBeNull();
  });
});
