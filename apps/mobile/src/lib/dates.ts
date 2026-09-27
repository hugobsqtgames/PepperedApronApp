import { fromIsoDate } from '@pepperedapron/core';

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, o: Intl.DateTimeFormatOptions) {
  const k = `${locale}|${JSON.stringify(o)}`;
  let f = cache.get(k);
  if (!f) cache.set(k, (f = new Intl.DateTimeFormat(locale, o)));
  return f;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const dayLong = (iso: string, l: string) =>
  cap(fmt(l, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromIsoDate(iso)));
export const dayShort = (iso: string, l: string) =>
  cap(fmt(l, { weekday: 'short', day: 'numeric' }).format(fromIsoDate(iso)));
export const weekdayShort = (iso: string, l: string) =>
  cap(fmt(l, { weekday: 'short' }).format(fromIsoDate(iso)));
export const dayMonth = (iso: string, l: string) =>
  fmt(l, { day: 'numeric', month: 'long' }).format(fromIsoDate(iso));
export const monthYear = (iso: string, l: string) =>
  cap(fmt(l, { month: 'long', year: 'numeric' }).format(fromIsoDate(iso)));
export const dateTime = (d: string | Date, l: string) =>
  fmt(l, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
