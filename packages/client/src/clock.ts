/**
 * Hybrid logical clock. Every change gets a timestamp that is
 * - close to wall-clock time (so "last writer wins" matches what users expect),
 * - strictly increasing on a device, even if the system clock goes backwards,
 * - greater than any timestamp the device has already seen from other devices,
 * - unique across devices (the device id breaks ties).
 * Timestamps are fixed-width strings, so comparing them as strings orders them.
 */
const MS_WIDTH = 15;
const COUNTER_WIDTH = 5;
const COUNTER_MAX = 36 ** COUNTER_WIDTH - 1;

export interface ParsedHlc {
  ms: number;
  counter: number;
  deviceId: string;
}

export function formatHlc(ms: number, counter: number, deviceId: string): string {
  return `${String(ms).padStart(MS_WIDTH, '0')}-${counter.toString(36).padStart(COUNTER_WIDTH, '0')}-${deviceId}`;
}

const HLC_RE = /^(\d{15})-([0-9a-z]{5})-([0-9A-Za-z-]{1,64})$/;

export function parseHlc(hlc: string): ParsedHlc | null {
  const m = HLC_RE.exec(hlc);
  if (!m) return null;
  return { ms: Number(m[1]), counter: parseInt(m[2]!, 36), deviceId: m[3]! };
}

export const isHlc = (v: unknown): v is string => typeof v === 'string' && HLC_RE.test(v);

/** Wall-clock time of a timestamp, as an ISO date (used to sort "recently updated"). */
export function hlcToIso(hlc: string): string {
  const p = parseHlc(hlc);
  return new Date(p ? p.ms : 0).toISOString();
}

export class HybridClock {
  private ms = 0;
  private counter = 0;

  constructor(
    readonly deviceId: string,
    last: string | null = null,
    private readonly now: () => number = Date.now,
  ) {
    if (last) this.receive(last);
  }

  /** Timestamp for a local change. */
  tick(): string {
    const wall = this.now();
    if (wall > this.ms) {
      this.ms = wall;
      this.counter = 0;
    } else if (this.counter >= COUNTER_MAX) {
      this.ms++;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return formatHlc(this.ms, this.counter, this.deviceId);
  }

  /** Remember a timestamp seen from another device so later local changes sort after it. */
  receive(remote: string) {
    const p = parseHlc(remote);
    if (!p) return;
    // Even if another device has a wrong date in the future, following it keeps every later
    // local change ordered after what we have seen, so no edit is silently lost.
    if (p.ms > this.ms || (p.ms === this.ms && p.counter > this.counter)) {
      this.ms = p.ms;
      this.counter = p.counter;
    }
  }
}
