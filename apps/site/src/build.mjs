/**
 * Builds the static website (no server, no cookies): home, help, privacy policy, terms and legal
 * notice in French and English. The app links to /<lang>/<page>.
 *
 *   node src/build.mjs [--out dist] [--production]
 *
 * Publisher details come from the environment (LEGAL_PUBLISHER, LEGAL_ADDRESS, LEGAL_HOSTING,
 * SUPPORT_EMAIL); --production refuses to build without them. SITE_DOMAIN writes a CNAME file
 * for GitHub Pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAQ, LEGAL, UI } from './content.mjs';
import { esc, LANG_NAMES, LANGS, LOGO_SVG, page } from './layout.mjs';
import { recipePage } from './recipePage.mjs';

export const PAGES = ['support', 'privacy', 'terms', 'legal'];

export function publisherFrom(env, production) {
  const p = {
    publisher: env.LEGAL_PUBLISHER,
    address: env.LEGAL_ADDRESS,
    hosting: env.LEGAL_HOSTING,
    email: env.SUPPORT_EMAIL,
  };
  const missing = Object.entries(p)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (production && missing.length)
    throw new Error(
      `Production site requires LEGAL_PUBLISHER, LEGAL_ADDRESS, LEGAL_HOSTING and SUPPORT_EMAIL (missing: ${missing.join(', ')})`,
    );
  return Object.fromEntries(
    Object.entries({
      publisher: p.publisher || 'PepperedApron',
      address: p.address || '—',
      hosting: p.hosting || 'GitHub Pages (GitHub, Inc.)',
      email: p.email || 'support@pepperedapron.app',
    }).map(([k, v]) => [k, esc(v)]),
  );
}

function nav(lang, current) {
  const u = UI[lang];
  const links = [['', u.home], ...PAGES.map((k) => [`${k}/`, u[k]])]
    .map(([href, label]) =>
      href.replace('/', '') === current
        ? `<b>${esc(label)}</b>`
        : `<a href="/${lang}/${href}">${esc(label)}</a>`,
    )
    .join('');
  const langs = LANGS.map((l) =>
    l === lang
      ? `<b>${LANG_NAMES[l]}</b>`
      : `<a href="/${l}/${current ? `${current}/` : ''}" hreflang="${l}">${LANG_NAMES[l]}</a>`,
  ).join('');
  return `<nav>${links}</nav><nav class="langs">${langs}</nav>`;
}

export function render(lang, pageName, p) {
  const u = UI[lang];
  if (pageName === '') {
    const body = `<h1>PepperedApron</h1><p class="muted">${esc(u.tagline)}</p><div class="card"><ul>${u.features
      .map((f) => `<li>${esc(f)}</li>`)
      .join('')}</ul><p>${esc(u.free)}</p></div>`;
    return page({ title: 'PepperedApron', lang, body, nav: nav(lang, ''), description: u.tagline });
  }
  if (pageName === 'support') {
    const f = FAQ[lang];
    const body = `<h1>${esc(f.title)}</h1><p class="muted">${esc(f.intro)}</p>${f.qa
      .map(([q, a]) => `<div class="card"><h2>${esc(q)}</h2><p class="muted">${esc(a)}</p></div>`)
      .join(
        '',
      )}<div class="card"><p>${esc(f.contact)} <a href="mailto:${p.email}">${p.email}</a></p></div>`;
    return page({ title: f.title, lang, body, nav: nav(lang, 'support'), description: f.intro });
  }
  const doc = LEGAL[lang][pageName](p);
  return page({ title: doc.title, lang, body: doc.html, nav: nav(lang, pageName) });
}

export function build(out, env = process.env, production = false) {
  const p = publisherFrom(env, production);
  fs.rmSync(out, { recursive: true, force: true });
  const write = (rel, content) => {
    const f = path.join(out, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  };
  for (const lang of LANGS) {
    write(`${lang}/index.html`, render(lang, '', p));
    for (const name of PAGES) write(`${lang}/${name}/index.html`, render(lang, name, p));
  }
  // Root: pick the visitor's language, with plain links when JavaScript is off.
  write(
    'index.html',
    page({
      title: 'PepperedApron',
      lang: 'en',
      body: `<script>(function(){var l=(navigator.language||'en').slice(0,2);location.replace('/'+(${JSON.stringify(LANGS)}.indexOf(l)>=0?l:'en')+'/');})();</script><p>${LANGS.map((l) => `<a href="/${l}/">${LANG_NAMES[l]}</a>`).join(' · ')}</p>`,
    }),
  );
  // A recipe shared from the app (the recipe is in the link, after "#").
  write('r/index.html', recipePage());
  write(
    '404.html',
    page({ title: '404', lang: 'en', body: '<h1>404</h1><p><a href="/">PepperedApron</a></p>' }),
  );
  write(
    'icon.svg',
    LOGO_SVG.replace(
      'width="40" height="40" aria-hidden="true"',
      'xmlns="http://www.w3.org/2000/svg"',
    ),
  );
  write('.nojekyll', '');
  if (env.SITE_DOMAIN) write('CNAME', `${env.SITE_DOMAIN}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = path.resolve(i > 0 ? process.argv[i + 1] : 'dist');
  build(out, process.env, process.argv.includes('--production'));
  console.info(`Site built in ${out}`);
}
