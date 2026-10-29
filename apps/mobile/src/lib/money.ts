import { getLocales } from 'expo-localization';

/** Prices are typed and shown in the currency of the device's region (€ in France). */
export function currencyCode(): string {
  return getLocales()[0]?.currencyCode ?? 'EUR';
}

export function formatMoney(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode() }).format(
      value,
    );
  } catch {
    return value.toFixed(2);
  }
}
