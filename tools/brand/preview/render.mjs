// Renders preview.html to the App Store Preview video and the iPhone screenshots.
//   node preview/render.mjs video [store|marketing]   → out/app-preview-<mode>.mp4 (886×1920, 30 fps)
//   node preview/render.mjs stills                    → out/screenshot-<n>.png (1320×2868)
// Frames are captured one by one (no real-time playback), so the result is identical on every run.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
const FPS = 30;

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const root of ['/opt/pw-browsers']) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs
      .readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .reverse()) {
      const exe = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined; // playwright's own browser
}

async function open(query, width, height) {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(here, 'preview.html')}?${query}`);
  await page.evaluate(() => window.ready);
  return { browser, page };
}

async function video(mode) {
  // App Store App Preview, iPhone 6.9"/6.5": 886×1920 portrait, 15–30 s, 30 fps, H.264 + AAC stereo.
  const { browser, page } = await open(`mode=${mode}`, 886, 1920);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * FPS);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `app-preview-${mode}.mp4`);
  const ff = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-i',
      '-',
      // Apple requires an audio track: silent stereo (replace with music in a video editor if wanted).
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-shortest',
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-level',
      '4.0',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      '11M',
      '-maxrate',
      '12M',
      '-bufsize',
      '24M',
      '-preset',
      'slow',
      '-r',
      String(FPS),
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-movflags',
      '+faststart',
      file,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`\r${mode}: ${i}/${frames} images`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
  await browser.close();
  console.info(`\n${file}`);
}

async function stills() {
  const { browser, page } = await open('still=0', 1320, 2868);
  const n = await page.evaluate(() => window.STILLS);
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => window.still(k), i);
    const file = path.join(outDir, `screenshot-${i + 1}.png`);
    await page.screenshot({ path: file, type: 'png' });
    console.info(file);
  }
  await browser.close();
}

const [cmd = 'video', mode = 'store'] = process.argv.slice(2);
if (cmd === 'stills') await stills();
else await video(mode);
