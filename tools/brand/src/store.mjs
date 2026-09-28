// Store marketing visuals (Google Play feature graphic) in the 5 app languages.
// `node src/store.mjs` → docs/store/assets/feature-graphic-<lang>.png (1024×500).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMany } from '../render.mjs';
import { COLORS as C, mark } from './brand.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const TAGLINES = {
  fr: ['Recettes, planning', 'et courses, enfin réunis.'],
  en: ['Recipes, meal plans', 'and groceries, together.'],
  es: ['Recetas, menús', 'y compras, por fin juntos.'],
  de: ['Rezepte, Essensplan', 'und Einkauf an einem Ort.'],
  it: ['Ricette, planning', 'e spesa, finalmente insieme.'],
};

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function featureGraphic(lang, photo, font) {
  const [l1, l2] = TAGLINES[lang];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <style>@font-face{font-family:Fraunces;src:url(data:font/ttf;base64,${font})}</style>
  <defs>
    <linearGradient id="fade" x1="0" x2="1">
      <stop offset="0.38" stop-color="${C.forest}"/>
      <stop offset="0.72" stop-color="${C.forest}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${C.forest}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="${C.forest}"/>
  <image href="data:image/jpeg;base64,${photo}" x="400" y="0" width="624" height="500" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1024" height="500" fill="url(#fade)"/>
  <g transform="translate(56 60) scale(0.13)">
    <rect width="1024" height="1024" rx="230" fill="${C.cream}"/>
    ${mark({ apron: C.forest, chili: C.paprika, stem: C.cream })}
  </g>
  <text x="200" y="138" font-family="Fraunces" font-weight="700" font-size="56" fill="${C.cream}" letter-spacing="-0.5">Peppered<tspan fill="#E8894F">Apron</tspan></text>
  <text font-family="Fraunces" font-weight="700" font-size="46" fill="${C.cream}">
    <tspan x="58" y="300">${escape(l1)}</tspan><tspan x="58" y="360">${escape(l2)}</tspan>
  </text>
  <rect x="58" y="400" width="84" height="6" rx="3" fill="${C.paprika}"/>
</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const photo = (
    await fs.readFile(path.join(root, 'apps/mobile/assets/photos/onboarding-recipes.jpg'))
  ).toString('base64');
  const font = (
    await fs.readFile(path.join(root, 'apps/mobile/assets/fonts/Fraunces_700Bold.ttf'))
  ).toString('base64');
  const jobs = [];
  for (const lang of Object.keys(TAGLINES))
    jobs.push({
      svg: await featureGraphic(lang, photo, font),
      out: path.join(root, `docs/store/assets/feature-graphic-${lang}.png`),
      width: 1024,
      height: 500,
      background: C.forest,
    });
  await renderMany(jobs);
  console.info('Store visuals generated.');
}
