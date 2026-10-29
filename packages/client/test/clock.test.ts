import { describe, expect, it } from 'vitest';
import { HybridClock, formatHlc, hlcToIso, isHlc, parseHlc } from '../src';

describe('hybrid logical clock', () => {
  it('is strictly increasing even when the wall clock stalls or goes back', () => {
    let now = 1_000;
    const c = new HybridClock('dev-a', null, () => now);
    const a = c.tick();
    const b = c.tick();
    now = 500; // user changed the date
    const d = c.tick();
    expect(a < b && b < d).toBe(true);
    expect(parseHlc(d)).toMatchObject({ ms: 1_000, counter: 2, deviceId: 'dev-a' });
  });

  it('orders local changes after everything seen from other devices', () => {
    const c = new HybridClock('dev-a', null, () => 1_000);
    const remote = formatHlc(5_000, 3, 'dev-b');
    c.receive(remote);
    expect(c.tick() > remote).toBe(true);
    c.receive('garbage');
    expect(c.tick() > remote).toBe(true);
  });

  it('resumes after the last known timestamp on restart', () => {
    const last = formatHlc(9_000, 7, 'dev-a');
    const c = new HybridClock('dev-a', last, () => 1_000);
    expect(c.tick() > last).toBe(true);
  });

  it('compares as strings, breaks ties by device and exposes the wall time', () => {
    const x = formatHlc(1_700_000_000_000, 0, 'a');
    const y = formatHlc(1_700_000_000_000, 0, 'b');
    const z = formatHlc(1_700_000_000_001, 0, 'a');
    expect([z, y, x].sort()).toEqual([x, y, z]);
    expect(hlcToIso(x)).toBe('2023-11-14T22:13:20.000Z');
    expect(isHlc(x)).toBe(true);
    expect(isHlc('1-2-3')).toBe(false);
    expect(isHlc(42)).toBe(false);
  });

  it('keeps thousands of changes in the same millisecond ordered', () => {
    const c = new HybridClock('d', null, () => 1);
    const ticks = Array.from({ length: 5_000 }, () => c.tick());
    expect([...ticks].sort()).toEqual(ticks);
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});
