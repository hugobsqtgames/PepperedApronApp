// Renders preview.html to the App Store Preview video and the iPhone screenshots.
//   node preview/render.mjs video [store|marketing]   → out/app-preview-<mode>.mp4 (886×1920, 30 fps)
//   node preview/render.mjs stills                    → out/screenshot-<n>.png (1320×2868)
//   node preview/render.mjs stills-ipad               → out/ipad-<n>.png (2064×2752)
//   node preview/render.mjs srt                       → docs/store/app-preview-<fr|en>.srt
//   add --en for the English version (files suffixed -en)
//   node preview/render.mjs sound                     → (re)put the soundtrack on rendered videos
// Frames are captured one by one (no real-time playback), so the result is identical on every run.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
const FPS = 30;
/** --en: the English version (files suffixed -en). */
const LANG = process.argv.includes('--en') ? 'en' : 'fr';
const SUFFIX = LANG === 'en' ? '-en' : '';

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
  const { browser, page } = await open(`mode=${mode}&lang=${LANG}`, 886, 1920);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * FPS);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `app-preview-${mode}${SUFFIX}.mp4`);
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
      // Synthesised soundtrack timed on the same timeline (sound.mjs).
      '-i',
      soundtrack(),
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
      ...AUDIO,
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

// Mobile loudness (-16 LUFS, peaks under -1 dBTP), AAC stereo 256 kb/s as Apple asks.
const AUDIO = [
  '-af',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-c:a',
  'aac',
  '-b:a',
  '256k',
  '-ar',
  '48000',
];

function soundtrack() {
  const wav = path.join(outDir, 'soundtrack.wav');
  const r = spawnSync('node', [path.join(here, 'sound.mjs'), wav], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('sound.mjs failed');
  return wav;
}

/** Put the soundtrack on videos already rendered (the picture is copied, not re-encoded). */
function sound() {
  const wav = soundtrack();
  for (const mode of ['store', 'marketing']) {
    const file = path.join(outDir, `app-preview-${mode}${SUFFIX}.mp4`);
    if (!fs.existsSync(file)) continue;
    const tmp = file.replace(/\.mp4$/, '.tmp.mp4');
    const args = ['-y', '-loglevel', 'error', '-i', file, '-i', wav, '-map', '0:v', '-map', '1:a'];
    args.push('-c:v', 'copy', ...AUDIO, '-shortest', '-movflags', '+faststart', tmp);
    if (spawnSync('ffmpeg', args, { stdio: 'inherit' }).status !== 0)
      throw new Error('ffmpeg failed');
    fs.renameSync(tmp, file);
    console.info(file);
  }
}

/** iPhone 6.9" (1320×2868) or, with ipad, iPad 13" (2064×2752) screenshots. */
async function stills(ipad = false) {
  const { browser, page } = ipad
    ? await open(`still=0&ipad=1&lang=${LANG}`, 2064, 2752)
    : await open(`still=0&lang=${LANG}`, 1320, 2868);
  const n = await page.evaluate(() => window.STILLS);
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => window.still(k), i);
    const file = path.join(outDir, `${ipad ? 'ipad' : 'screenshot'}-${i + 1}${SUFFIX}.png`);
    await page.screenshot({ path: file, type: 'png' });
    console.info(file);
  }
  await browser.close();
}

/** Subtitles of the App Preview (SRT), for the site and accessibility: docs/store/. */
async function srt(mode) {
  const { browser, page } = await open(`mode=${mode}&lang=${LANG}`, 443, 960);
  const subs = await page.evaluate(() => window.SUBTITLES);
  await browser.close();
  const ts = (s) => {
    const ms = Math.round(s * 1000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  const body = subs
    .map((c, i) => `${i + 1}\n${ts(Math.max(0, c.a))} --> ${ts(c.b)}\n${c.text}\n`)
    .join('\n');
  const file = path.join(here, '../../../docs/store', `app-preview-${LANG}.srt`);
  fs.writeFileSync(file, body);
  console.info(file);
}

const [cmd = 'video', mode = 'store'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (cmd === 'stills') await stills();
else if (cmd === 'stills-ipad') await stills(true);
else if (cmd === 'srt') await srt(mode);
else if (cmd === 'sound') sound();
else await video(mode);
