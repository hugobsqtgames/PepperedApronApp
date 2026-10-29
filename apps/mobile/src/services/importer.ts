import { importFromUrl, type FetchPage, type ImportResult } from '@pepperedapron/core';
import i18n from '../i18n';

const TIMEOUT_MS = 12_000;
const MAX_CHARS = 3_000_000;

/**
 * Downloads a public page directly from the phone (no server in between). Only what any browser
 * would see is read: never cookies, never pages behind a login.
 */
const fetchPage: FetchPage = async (url, opts) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      credentials: 'omit',
      headers: {
        Accept: opts?.accept ?? 'text/html',
        'Accept-Language': `${i18n.language},en;q=0.5`,
      },
    });
    const body = (await res.text()).slice(0, MAX_CHARS);
    return { status: res.status, contentType: res.headers.get('content-type'), body };
  } finally {
    clearTimeout(timer);
  }
};

/** Recipe draft from a link; offline or unreadable pages still give a draft with the link. */
export function importLink(url: string): Promise<ImportResult> {
  return importFromUrl(fetchPage, url);
}
