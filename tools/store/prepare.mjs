// Prepares the App Store listing for fastlane deliver, from the repository's single source:
// docs/store/listings.json (texts) and tools/brand/preview/out (screenshots, see tools/brand).
//   SITE_URL=https://pepperedapron.app node tools/store/prepare.mjs [outDir] [--texts-only]
// Writes <outDir>/metadata/<locale>/*.txt and <outDir>/screenshots/<locale>/*.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const textsOnly = args.includes('--texts-only');
const out = path.resolve(
  args.find((a) => !a.startsWith('--')) ?? path.join(root, 'tools/store/out'),
);
const site = (process.env.SITE_URL ?? 'https://pepperedapron.app').replace(/\/+$/, '');
const listings = JSON.parse(fs.readFileSync(path.join(root, 'docs/store/listings.json'), 'utf8'));
const shots = path.join(root, 'tools/brand/preview/out');

/** App Store locale ↔ listing language ↔ suffix of the rendered screenshots. */
const LOCALES = [
  { store: 'fr-FR', lang: 'fr', suffix: '' },
  { store: 'en-US', lang: 'en', suffix: '-en' },
];

const LIMITS = { name: 30, subtitle: 30, keywords: 100, promotionalText: 170, description: 4000 };

fs.rmSync(out, { recursive: true, force: true });
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text.trim()}\n`);
};

const meta = path.join(out, 'metadata');
write(path.join(meta, 'copyright.txt'), `© ${new Date().getFullYear()} PepperedApron`);
write(path.join(meta, 'primary_category.txt'), 'FOOD_AND_DRINK');
write(path.join(meta, 'secondary_category.txt'), 'LIFESTYLE');
// The App Review notes and contact are filled by hand in App Store Connect: Apple refuses the
// notes without the developer's contact details, which do not belong in this repository.

let count = 0;
for (const { store, lang, suffix } of LOCALES) {
  const l = listings[lang];
  for (const [k, max] of Object.entries(LIMITS))
    if (l[k].length > max) throw new Error(`${lang}.${k}: ${l[k].length} > ${max} characters`);
  const dir = path.join(meta, store);
  write(path.join(dir, 'name.txt'), l.name);
  write(path.join(dir, 'subtitle.txt'), l.subtitle);
  write(path.join(dir, 'keywords.txt'), l.keywords);
  write(path.join(dir, 'promotional_text.txt'), l.promotionalText);
  write(path.join(dir, 'description.txt'), l.description);
  write(path.join(dir, 'support_url.txt'), `${site}/${lang}/support/`);
  write(path.join(dir, 'privacy_url.txt'), `${site}/${lang}/privacy/`);
  write(path.join(dir, 'marketing_url.txt'), `${site}/${lang}/`);
  // Screenshots, in the order of the captions (iPhone 6.9" and iPad 13", recognised by size).
  if (textsOnly) continue;
  const sdir = path.join(out, 'screenshots', store);
  fs.mkdirSync(sdir, { recursive: true });
  for (let i = 1; i <= l.screenshots.length; i++)
    for (const [kind, name] of [
      ['iphone', `screenshot-${i}${suffix}.png`],
      ['ipad', `ipad-${i}${suffix}.png`],
    ]) {
      const src = path.join(shots, name);
      if (!fs.existsSync(src))
        throw new Error(`missing screenshot ${name} (run tools/brand stills)`);
      fs.copyFileSync(src, path.join(sdir, `${String(i).padStart(2, '0')}_${kind}_${name}`));
      count++;
    }
}
console.info(`store listing ready in ${out}: ${LOCALES.length} languages, ${count} screenshots`);
