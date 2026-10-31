import { packSize, pantryPlaceFor, type PantryPlace } from '@pepperedapron/core';
import { ENV } from './env';

/**
 * A scanned barcode → the product's name and size, from Open Food Facts (a free, open database
 * run by a non-profit). Only the barcode number is sent; no account, nothing about the user.
 */
export interface ScannedProduct {
  code: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  place: PantryPlace;
}

interface OffProduct {
  product_name?: string;
  product_name_fr?: string;
  product_name_en?: string;
  generic_name?: string;
  generic_name_fr?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
}

const FIELDS =
  'product_name,product_name_fr,product_name_en,generic_name,generic_name_fr,brands,quantity,categories_tags';

function placeOf(p: OffProduct, name: string): PantryPlace {
  const tags = p.categories_tags ?? [];
  if (tags.some((t) => /frozen|surgel/.test(t))) return 'freezer';
  if (
    tags.some((t) =>
      /en:(dairies|yogurts|cheeses|fresh-cheeses|meats|fishes|fresh-foods|eggs|hams|sausages|creams|butters|fresh-vegetables|salads|refrigerated)/.test(
        t,
      ),
    )
  )
    return /en:eggs/.test(tags.join(' ')) ? 'pantry' : 'fridge';
  return pantryPlaceFor(name);
}

/** Null when the product is unknown; throws when the network cannot be reached. */
export async function lookupBarcode(
  code: string,
  language: string,
): Promise<ScannedProduct | null> {
  if (!/^\d{8,14}$/.test(code)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`,
      {
        signal: ctrl.signal,
        // Open Food Facts asks apps to name themselves.
        headers: {
          'User-Agent': `PepperedApron/${ENV.appVersion} (${ENV.supportEmail || ENV.siteUrl})`,
        },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`http_${res.status}`);
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    const p = body.product;
    if (!body.status || !p) return null;
    const fr = language.startsWith('fr');
    const name = (
      (fr ? p.product_name_fr || p.generic_name_fr : p.product_name_en) ||
      p.product_name ||
      p.generic_name ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!name) return null;
    return { code, name, ...packSize(p.quantity), place: placeOf(p, name) };
  } finally {
    clearTimeout(timer);
  }
}
