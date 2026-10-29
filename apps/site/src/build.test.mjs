import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build, PAGES } from './build.mjs';
import { LANGS } from './layout.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-site-'));

test('every page the app links to exists in every language', () => {
  build(out, { LEGAL_PUBLISHER: 'Chef & Co <SAS>', SUPPORT_EMAIL: 'help@example.com' });
  for (const l of LANGS)
    for (const p of ['', ...PAGES]) {
      const f = path.join(out, l, p, 'index.html');
      assert.ok(fs.existsSync(f), f);
      const html = fs.readFileSync(f, 'utf8');
      assert.match(html, new RegExp(`<html lang="${l}">`));
      assert.doesNotMatch(html, /undefined|\$\{/);
    }
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'icon.svg')));
});

test('publisher details are escaped and the policy describes a no-account app', () => {
  const fr = fs.readFileSync(path.join(out, 'fr/privacy/index.html'), 'utf8');
  assert.match(fr, /Chef &#38; Co &#60;SAS&#62;/);
  assert.match(fr, /ni compte, ni serveur, ni publicité/);
  assert.doesNotMatch(fr, /AdMob/);
  assert.match(
    fs.readFileSync(path.join(out, 'de/support/index.html'), 'utf8'),
    /help@example\.com/,
  );
  // Languages without a translated legal text show the English one with a notice.
  assert.match(
    fs.readFileSync(path.join(out, 'es/terms/index.html'), 'utf8'),
    /solo está disponible/,
  );
});

test('a production build refuses to publish without the legal details', () => {
  assert.throws(() => build(out, {}, true), /LEGAL_PUBLISHER/);
});
