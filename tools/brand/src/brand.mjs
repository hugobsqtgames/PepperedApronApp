// Single source of truth for the PepperedApron identity. `node src/brand.mjs` regenerates every asset.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMany } from '../render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = (...p) => path.join(root, ...p);

export const COLORS = {
  forest: '#1F4D3A', // primary — dark green
  paprika: '#D2642A', // accent — warm autumn orange
  cream: '#F7F1E6', // background
  sand: '#E8DFCF', // surfaces / lines
  ink: '#1F2A24', // text
  night: '#121814', // dark theme background
};

const CHILI_T = 'translate(-22 4) translate(512 660) rotate(-14) scale(1.12) translate(-512 -660)';
const CHILI_BODY =
  'M556 556 C640 574 650 668 596 730 C556 776 486 790 410 772 C472 752 530 716 548 660 C558 628 548 596 526 574 C532 562 544 556 556 556 Z';
const CHILI_CAP = 'M512 566 C520 540 552 530 578 546 C570 566 546 578 522 578 Z';
const CHILI_STEM = 'M552 544 C556 520 572 504 596 500';
const APRON =
  'M398 330 H626 Q648 330 650 352 L656 440 Q660 476 700 482 L716 484 Q740 488 742 514 L766 790 Q770 840 718 840 H306 Q254 840 258 790 L282 514 Q284 488 308 484 L324 482 Q364 476 368 440 L374 352 Q376 330 398 330 Z';
const straps = (c) => `
  <path d="M418 352 C410 250 614 250 606 352" fill="none" stroke="${c}" stroke-width="32" stroke-linecap="round"/>
  <path d="M300 500 C250 500 212 516 194 558 M300 500 C262 520 244 562 248 610" fill="none" stroke="${c}" stroke-width="28" stroke-linecap="round"/>
  <path d="M724 500 C774 500 812 516 830 558 M724 500 C762 520 780 562 776 610" fill="none" stroke="${c}" stroke-width="28" stroke-linecap="round"/>`;
/** Optical centering of the whole mark on the 1024 grid. */
const LIFT = 'translate(0 -28)';

/** Apron + chili mark, drawn on a 1024 grid. */
export function mark({ apron, chili, stem, strap = apron }) {
  return `<g transform="${LIFT}">${straps(strap)}
  <path d="${APRON}" fill="${apron}"/>
  <g transform="${CHILI_T}">
    <path d="${CHILI_BODY}" fill="${chili}"/>
    <path d="${CHILI_CAP}" fill="${stem}"/>
    <path d="${CHILI_STEM}" fill="none" stroke="${stem}" stroke-width="15" stroke-linecap="round"/>
  </g></g>`;
}

/** Single-colour silhouette with the chili cut out (Android monochrome, notification, tinted). */
export function silhouette(color, id = 'cut') {
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>
  <g transform="${LIFT} ${CHILI_T}"><path d="${CHILI_BODY}" fill="#000"/><path d="${CHILI_CAP}" fill="#000" stroke="#000" stroke-width="10"/></g></mask></defs>
  <g transform="${LIFT}">${straps(color)}</g><g mask="url(#${id})"><g transform="${LIFT}"><path d="${APRON}" fill="${color}"/></g></g>`;
}

const svg = (w, h, body, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${body}</svg>`;
const scaled = (s, body) =>
  `<g transform="translate(${512 - 512 * s} ${512 - 512 * s}) scale(${s})">${body}</g>`;

const C = COLORS;
export const variants = {
  // iOS app icon (system applies the squircle mask).
  icon: svg(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="${C.forest}"/>${mark({ apron: C.cream, chili: C.paprika, stem: C.forest })}`,
  ),
  iconDark: svg(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="${C.night}"/>${mark({ apron: '#2E6A51', chili: '#E07A3F', stem: C.night })}`,
  ),
  iconTinted: svg(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="#000"/>${silhouette('#FFFFFF', 't')}`,
  ),
  // Android adaptive icon: content kept inside the 66% safe zone.
  androidForeground: svg(
    1024,
    1024,
    scaled(0.62, mark({ apron: C.cream, chili: C.paprika, stem: C.forest })),
  ),
  androidBackground: svg(1024, 1024, `<rect width="1024" height="1024" fill="${C.forest}"/>`),
  androidMonochrome: svg(1024, 1024, scaled(0.62, silhouette('#FFFFFF', 'm'))),
  // Splash: mark only, background set by the splash config (light & dark).
  splash: svg(1024, 1024, mark({ apron: C.forest, chili: C.paprika, stem: C.cream })),
  splashDark: svg(1024, 1024, mark({ apron: C.cream, chili: C.paprika, stem: C.night })),
  // Android notification icon: white silhouette.
  notification: svg(96, 96, silhouette('#FFFFFF', 'n'), '0 0 1024 1024'),
  // Live Activity / widget glyph (small, < 4 KB).
  glyph: svg(96, 96, mark({ apron: C.cream, chili: C.paprika, stem: C.forest }), '0 0 1024 1024'),
  // Mark on transparent background for UI and documents.
  mark: svg(1024, 1024, mark({ apron: C.forest, chili: C.paprika, stem: C.cream })),
  markOnDark: svg(1024, 1024, mark({ apron: C.cream, chili: C.paprika, stem: C.forest })),
};

async function fontFace() {
  const ttf = await fs.readFile(out('apps/mobile/assets/fonts/Fraunces_700Bold.ttf'));
  return `<style>@font-face{font-family:Fraunces;src:url(data:font/ttf;base64,${ttf.toString('base64')})}</style>`;
}

export async function logoFull(dark = false) {
  const ink = dark ? C.cream : C.forest;
  const body = `${await fontFace()}<g transform="translate(0 8) scale(0.25)">${mark({ apron: ink, chili: C.paprika, stem: dark ? C.forest : C.cream })}</g>
  <text x="262" y="164" font-family="Fraunces" font-weight="700" font-size="104" fill="${ink}" letter-spacing="-1">Peppered<tspan fill="${C.paprika}">Apron</tspan></text>`;
  return svg(1080, 256, body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fs.mkdir(out('docs/brand'), { recursive: true });
  for (const [k, v] of Object.entries(variants))
    await fs.writeFile(out('docs/brand', `${k}.svg`), v);
  await fs.writeFile(out('docs/brand/logo-full.svg'), await logoFull(false));
  await fs.writeFile(out('docs/brand/logo-full-dark.svg'), await logoFull(true));
  const A = (p) => out('apps/mobile/assets', p);
  await renderMany([
    { svg: variants.icon, out: A('icon.png'), width: 1024 },
    { svg: variants.iconDark, out: A('icon-dark.png'), width: 1024 },
    { svg: variants.iconTinted, out: A('icon-tinted.png'), width: 1024 },
    { svg: variants.androidForeground, out: A('android-icon-foreground.png'), width: 1024 },
    { svg: variants.androidBackground, out: A('android-icon-background.png'), width: 1024 },
    { svg: variants.androidMonochrome, out: A('android-icon-monochrome.png'), width: 1024 },
    { svg: variants.splash, out: A('splash-icon.png'), width: 1024 },
    { svg: variants.splashDark, out: A('splash-icon-dark.png'), width: 1024 },
    { svg: variants.notification, out: A('notification-icon.png'), width: 96 },
    { svg: variants.glyph, out: A('liveActivity/glyph.png'), width: 64 },
    { svg: variants.glyph, out: out('apps/mobile/targets/widgets/assets/glyph.png'), width: 96 },
    { svg: variants.mark, out: A('brand/mark.png'), width: 512 },
    { svg: variants.markOnDark, out: A('brand/mark-dark.png'), width: 512 },
    { svg: variants.icon, out: out('docs/brand/icon-1024.png'), width: 1024 },
    { svg: await logoFull(false), out: out('docs/brand/logo-full.png'), width: 1080, height: 256 },
    {
      svg: await logoFull(true),
      out: out('docs/brand/logo-full-dark.png'),
      width: 1080,
      height: 256,
      background: C.night,
    },
  ]);
  console.info('Brand assets generated.');
}
