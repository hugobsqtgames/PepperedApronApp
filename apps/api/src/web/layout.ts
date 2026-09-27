export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const LOGO_SVG = `<svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#1F4D3A"/><path d="M24 14h16v6c0 2 1.5 3 3.5 3.5L46 24v22a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V24l2.5-.5C22.5 23 24 22 24 20z" fill="#F7F1E6"/><circle cx="32" cy="38" r="6" fill="#D9822B"/><path d="M32 30c1.5-3 4-4 6-4" stroke="#1F4D3A" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

/** Minimal, dependency-free page shell sharing the app's palette (light + dark). */
export function page(opts: { title: string; lang: string; body: string; description?: string; image?: string | null; appLink?: string | null }): string {
  return `<!doctype html><html lang="${esc(opts.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)} · PepperedApron</title>
<meta name="description" content="${esc(opts.description ?? '')}">
<meta property="og:title" content="${esc(opts.title)}"><meta property="og:site_name" content="PepperedApron">
${opts.description ? `<meta property="og:description" content="${esc(opts.description)}">` : ''}
${opts.image ? `<meta property="og:image" content="${esc(opts.image)}">` : ''}
${opts.appLink ? `<meta name="apple-itunes-app" content="app-argument=${esc(opts.appLink)}">` : ''}
<meta name="robots" content="noindex">
<style>
:root{--bg:#F7F1E6;--card:#FFFDF8;--ink:#1F2A24;--muted:#6B6358;--primary:#1F4D3A;--on-primary:#FFFDF8;--accent:#D9822B;--line:#E8DFCF}
@media (prefers-color-scheme:dark){:root{--bg:#141A16;--card:#1C241F;--ink:#F2ECE1;--muted:#A89F92;--primary:#7FB89A;--on-primary:#10231A;--accent:#E89A4A;--line:#2C362F}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}header{display:flex;align-items:center;gap:12px;margin-bottom:24px;font-weight:700;color:var(--primary);font-size:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:16px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}h2{font-size:18px;margin:0 0 12px}.muted{color:var(--muted)}
.hero{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:20px;margin-bottom:16px;background:var(--line)}
.btn{display:inline-block;background:var(--primary);color:var(--on-primary);text-decoration:none;font-weight:600;padding:14px 20px;border-radius:14px;border:0;font-size:16px;cursor:pointer}
.btn.secondary{background:transparent;color:var(--primary);border:1.5px solid var(--primary)}.row{display:flex;gap:12px;flex-wrap:wrap}
ul,ol{padding-left:20px}li{margin:6px 0}.chip{display:inline-block;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;font-size:14px}
input{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px;margin:6px 0 12px}
.group{font-weight:600;margin-top:12px}
</style></head><body><main><header>${LOGO_SVG}<span>PepperedApron</span></header>${opts.body}</main></body></html>`;
}

export type WebLang = 'fr' | 'en' | 'es' | 'de' | 'it';
export function pickLang(acceptLanguage: string | undefined): WebLang {
  const langs = (acceptLanguage ?? '').split(',').map((l) => l.trim().slice(0, 2).toLowerCase());
  return (langs.find((l) => ['fr', 'en', 'es', 'de', 'it'].includes(l)) as WebLang | undefined) ?? 'en';
}
