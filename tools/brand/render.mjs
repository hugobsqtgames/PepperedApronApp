// Renders brand SVGs to PNG with headless Chromium (no native image deps).
// Usage: node render.mjs <in.svg> <out.png> <width> [height] [background]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function renderMany(jobs) {
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    const svg = j.svg ?? (await fs.readFile(j.in, 'utf8'));
    const h = j.height ?? j.width;
    await page.setViewportSize({ width: j.width, height: h });
    await page.setContent(
      `<html><head><style>html,body{margin:0;background:${j.background ?? 'transparent'}}body>svg{display:block;width:${j.width}px;height:${h}px}</style></head><body>${svg}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    await fs.mkdir(path.dirname(j.out), { recursive: true });
    await page.screenshot({
      path: j.out,
      omitBackground: !j.background,
      clip: { x: 0, y: 0, width: j.width, height: h },
    });
  }
  await browser.close();
}

if (process.argv[2]) {
  const [, , input, out, w, h, bg] = process.argv;
  await renderMany([
    { in: input, out, width: Number(w), height: h ? Number(h) : undefined, background: bg },
  ]);
}
