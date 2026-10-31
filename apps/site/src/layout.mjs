export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The app icon (tools/brand, docs/brand/icon.svg) with rounded corners. */
export const LOGO_SVG = `<svg viewBox="0 0 1024 1024" width="40" height="40" aria-hidden="true"><rect width="1024" height="1024" rx="230" fill="#1F4D3A"/><g transform="translate(0 -28)"> <path d="M418 352 C410 250 614 250 606 352" fill="none" stroke="#F7F1E6" stroke-width="32" stroke-linecap="round"/> <path d="M300 500 C250 500 212 516 194 558 M300 500 C262 520 244 562 248 610" fill="none" stroke="#F7F1E6" stroke-width="28" stroke-linecap="round"/> <path d="M724 500 C774 500 812 516 830 558 M724 500 C762 520 780 562 776 610" fill="none" stroke="#F7F1E6" stroke-width="28" stroke-linecap="round"/> <path d="M398 330 H626 Q648 330 650 352 L656 440 Q660 476 700 482 L716 484 Q740 488 742 514 L766 790 Q770 840 718 840 H306 Q254 840 258 790 L282 514 Q284 488 308 484 L324 482 Q364 476 368 440 L374 352 Q376 330 398 330 Z" fill="#F7F1E6"/> <g transform="translate(-22 4) translate(512 660) rotate(-14) scale(1.12) translate(-512 -660)"> <path d="M556 556 C640 574 650 668 596 730 C556 776 486 790 410 772 C472 752 530 716 548 660 C558 628 548 596 526 574 C532 562 544 556 556 556 Z" fill="#D2642A"/> <path d="M512 566 C520 540 552 530 578 546 C570 566 546 578 522 578 Z" fill="#1F4D3A"/> <path d="M552 544 C556 520 572 504 596 500" fill="none" stroke="#1F4D3A" stroke-width="15" stroke-linecap="round"/> </g></g></svg>`;

export const LANGS = ['fr', 'en'];

/**
 * Path the site is served under: '' on its own domain, '/PepperedApronApp' on the free GitHub
 * Pages address (https://<user>.github.io/<repo>/). Every link of the site starts with it.
 */
let BASE = '';
export const base = () => BASE;
export function setBase(b) {
  const t = String(b ?? '')
    .trim()
    .replace(/\/+$/, '');
  BASE = t && !t.startsWith('/') ? `/${t}` : t;
}
export const LANG_NAMES = { fr: 'Français', en: 'English' };

/** Minimal, dependency-free page shell sharing the app's palette (light + dark). */
export function page({ title, lang, body, nav, description = '', head = '' }) {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · PepperedApron</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${BASE}/icon.svg" type="image/svg+xml">${head}
<style>
:root{--bg:#F7F1E6;--card:#FFFDF8;--ink:#1F2A24;--muted:#646962;--primary:#1F4D3A;--accent:#A84A1A;--line:#E8DFCF}
@media (prefers-color-scheme:dark){:root{--bg:#121814;--card:#1C241F;--ink:#F2ECE1;--muted:#A89F92;--primary:#86C1A2;--accent:#E8894F;--line:#2C362F}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}header{display:flex;align-items:center;gap:12px;margin-bottom:24px;font-weight:700;color:var(--primary);font-size:20px}
header a{color:inherit;text-decoration:none;display:flex;align-items:center;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:16px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}h2{font-size:18px;margin:0 0 12px}.muted{color:var(--muted)}
a{color:var(--primary)}ul{padding-left:20px}li{margin:6px 0}
nav{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:32px;font-size:14px}nav.langs{margin-top:8px}
</style></head><body><main><header><a href="${BASE}/${esc(lang)}/">${LOGO_SVG}<span>PepperedApron</span></a></header>${body}${nav ?? ''}</main></body></html>`;
}
