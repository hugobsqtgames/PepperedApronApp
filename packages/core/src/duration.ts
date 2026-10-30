import type { Locale } from './enums';

/** ISO 8601 duration ("PT1H30M", "P0DT0H45M") → minutes. */
export function parseIsoDuration(s: string | null | undefined): number | null {
  if (!s || typeof s !== 'string') return null;
  const m = s
    .trim()
    .match(
      /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
    );
  if (!m || s.trim() === 'P' || s.trim() === 'PT') return null;
  const [, d, h, min, sec] = m;
  const total =
    Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(sec ?? 0) / 60;
  return Number.isFinite(total) ? Math.round(total) : null;
}

const HOUR = '(?:h|hr|hrs|hour|hours|heure|heures|hora|horas|std|std\\.|stunde|stunden|ora|ore)';
const MIN = '(?:m|mn|min|mins|minute|minutes|minuto|minutos|minuten|minuti)';
const SEC =
  '(?:s|sec|secs|second|seconds|seconde|secondes|segundo|segundos|sekunde|sekunden|secondo|secondi)';

// Numbers only start where no digit precedes ("(?<!\d)"): without it, a long run of digits
// ("99999…", easy to find in a web page) makes every position a candidate and the matching
// quadratic — 50 000 digits took 30 s and froze the app.
const NUM = '(?<!\\d)(\\d+(?:\\.\\d+)?)';
const RE_HOUR_MIN = new RegExp(
  `${NUM}\\s*${HOUR}\\.?\\s*(?:et\\s+|and\\s+|y\\s+|und\\s+|e\\s+)?(\\d{1,2})\\s*(?:${MIN})?(?![a-z])`,
);
const RE_HOUR = new RegExp(`${NUM}\\s*${HOUR}(?![a-z])`);
const RE_MIN = new RegExp(`${NUM}\\s*(?:${MIN}(?![a-z])|['’](?!['’]))`);
const RE_SEC = new RegExp(`(?<!\\d)(\\d+)\\s*${SEC}(?![a-z])`);
const RE_HAS_MIN_OR_HOUR = new RegExp(`\\d\\s*(?:${MIN}|${HOUR})(?![a-z])`);

/**
 * Free text duration → minutes. "1 h 30", "1h30", "90 min", "1 heure 15 minutes", "2 Std.", "45'".
 * Returns the first duration found, or null.
 */
export function parseDurationText(text: string): number | null {
  const s = text.toLowerCase().replace(/,/g, '.');
  let m = s.match(RE_HOUR_MIN);
  if (m) return Math.round(Number(m[1]) * 60 + Number(m[2]));
  m = s.match(RE_HOUR);
  if (m) return Math.round(Number(m[1]) * 60);
  m = s.match(RE_MIN);
  if (m) return Math.round(Number(m[1]));
  m = s.match(RE_SEC);
  if (m) return Math.max(1, Math.round(Number(m[1]) / 60));
  return null;
}

/** Like parseDurationText but returns seconds and keeps sub-minute precision (for timers). */
export function parseTimerSeconds(text: string): number | null {
  const s = text.toLowerCase();
  const sec = s.match(RE_SEC);
  const hasMinOrHour = RE_HAS_MIN_OR_HOUR.test(s);
  if (sec && !hasMinOrHour) return Number(sec[1]);
  const min = parseDurationText(s);
  return min === null ? null : min * 60;
}

export function formatMinutes(total: number | null | undefined, locale: Locale): string {
  if (total === null || total === undefined || !(total >= 0)) return '';
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return locale === 'fr' ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h ${m} min`;
}

/** mm:ss or h:mm:ss for timers. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Total time: explicit value wins, otherwise prep + cook + rest when any is known. */
export function computeTotalMinutes(r: {
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  totalMinutes: number | null;
}): number | null {
  if (r.totalMinutes !== null && r.totalMinutes > 0) return r.totalMinutes;
  const parts = [r.prepMinutes, r.cookMinutes, r.restMinutes].filter(
    (x): x is number => x !== null,
  );
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}
