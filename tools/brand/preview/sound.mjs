// Soundtrack of the App Preview, synthesised (no samples, so no rights to clear) and timed on the
// timeline of preview.html: a warm music bed, kitchen foley (knife on a board, simmering pan,
// kitchen timer), paper and pencil for the planning and the shopping list, soft interface sounds.
// Deterministic: the same file on every run. Writes a 48 kHz stereo 16-bit WAV.
import fs from 'node:fs';

const SR = 48000;
const DUR = 28;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);

// ------------------------------------------------------------------ helpers
let seed = 0x5eed1234;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Write `fn(i, tLocal)` (mono sample) at time t, with gain and pan (-1 left … 1 right). */
function put(t, seconds, gain, pan, fn) {
  const s0 = Math.round(t * SR);
  const n = Math.round(seconds * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const k = s0 + i;
    if (k < 0 || k >= N) continue;
    const v = fn(i, i / SR);
    L[k] += v * gl;
    R[k] += v * gr;
  }
}

/** Biquad band-pass (RBJ), applied sample by sample; centre can move over time. */
function bandpass() {
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  return (x, f, q) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const a = Math.sin(w) / (2 * q);
    const b0 = a,
      b2 = -a,
      a0 = 1 + a,
      a1 = -2 * Math.cos(w),
      a2 = 1 - a;
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}
const onePoleLP = (f) => {
  const k = 1 - Math.exp((-2 * Math.PI * f) / SR);
  let y = 0;
  return (x) => (y += k * (x - y));
};

// ------------------------------------------------------------------ music bed
// Warm electric-piano chords (sine + soft harmonics, slow attack), Cmaj7 · Am9 · Fmaj7 · G6.
const CHORDS = [
  [48, 52, 55, 59, 64], // Cmaj7
  [45, 52, 55, 59, 60], // Am9-ish
  [41, 48, 52, 55, 57], // Fmaj7/A
  [43, 50, 55, 59, 64], // G6
];
function epiano(t, len, note, gain, pan) {
  const f = midi(note);
  put(t, len + 1.6, gain, pan, (i, x) => {
    const a = Math.min(1, x / 0.08);
    const d = Math.exp(-x * 0.9) * 0.7 + 0.3;
    const rel = x > len ? Math.exp(-(x - len) * 3) : 1;
    const trem = 1 + 0.06 * Math.sin(2 * Math.PI * 4.2 * x);
    const v =
      Math.sin(2 * Math.PI * f * x) +
      0.32 * Math.sin(2 * Math.PI * 2 * f * x) * Math.exp(-x * 2) +
      0.12 * Math.sin(2 * Math.PI * 3 * f * x) * Math.exp(-x * 4);
    return v * a * d * rel * trem;
  });
}
const BAR = 3.5;
for (let b = 0; b * BAR < 25; b++) {
  const ch = CHORDS[b % 4];
  const t0 = 0.15 + b * BAR;
  ch.forEach((n, k) => epiano(t0 + k * 0.012, BAR - 0.2, n, 0.028, (k - 2) * 0.25));
  // soft bass on the root, and a gentle pluck on beat 3
  epiano(t0, BAR - 0.3, ch[0] - 12, 0.045, 0);
  epiano(t0 + BAR / 2, 0.6, ch[ch.length - 1] + 12, 0.014, 0.4);
}
// Outro: open chord swell under the logo.
[48, 55, 59, 62, 64, 67].forEach((n, k) =>
  epiano(25.0 + k * 0.05, 2.6, n, 0.034, (k - 2.5) * 0.25),
);
epiano(25.0, 2.6, 36, 0.05, 0);

// ------------------------------------------------------------------ kitchen foley
// Room tone: a quiet, warm kitchen all along.
{
  const lp = onePoleLP(500);
  const lp2 = onePoleLP(500);
  put(0, DUR, 0.05, -0.3, () => lp(noise()));
  put(0, DUR, 0.05, 0.3, () => lp2(noise()));
}

/** Knife on a wooden board: a dull thump with a short woody click. */
function chop(t, gain, pan) {
  const bp = bandpass();
  put(t, 0.16, gain, pan, (i, x) => {
    const thump = Math.sin(2 * Math.PI * (150 - 260 * x) * x) * Math.exp(-x * 45);
    const click = bp(noise(), 2600, 1.4) * Math.exp(-x * 160);
    return thump * 0.9 + click * 1.6;
  });
}
// Opening: someone chopping vegetables while the recipes float around.
for (let k = 0, t = 0.35; t < 2.7; k++, t += 0.38 + rnd() * 0.08) chop(t, 0.28 - k * 0.012, -0.2);

/** A pan simmering: bubbles (tiny rising tones) and a soft sizzle. */
function simmer(t0, t1, gain) {
  const hp = bandpass();
  put(t0, t1 - t0, gain * 0.35, 0.25, (i, x) => {
    const env = Math.min(1, x / 0.6, (t1 - t0 - x) / 0.6);
    const crackle = rnd() < 0.002 ? noise() * 4 : 0;
    return hp(noise() * 0.5 + crackle, 4200, 0.7) * env;
  });
  for (let t = t0; t < t1; t += 0.05 + rnd() * 0.12) {
    const f = 280 + rnd() * 420;
    put(
      t,
      0.06,
      gain * (0.5 + rnd() * 0.5),
      rnd() * 0.8 - 0.4,
      (i, x) =>
        Math.sin(2 * Math.PI * f * (1 + 6 * x) * x) * Math.exp(-x * 70) * Math.min(1, x / 0.004),
    );
  }
}
simmer(8.2, 12.6, 0.07); // the recipe just saved, a pan on the stove
simmer(20.6, 24.6, 0.11); // cooking mode

/** Kitchen timer: a little wind-up, then ticking until the end of the scene. */
function tick(t, gain, pan, f = 3200) {
  const bp = bandpass();
  put(t, 0.03, gain, pan, (i, x) => bp(noise(), f, 6) * Math.exp(-x * 260));
}
for (let i = 0; i < 9; i++) tick(21.78 + i * 0.026, 0.22, 0.1, 2400 + i * 120);
for (let t = 22.1, k = 0; t < 24.4; t += 0.25, k++) tick(t, k % 2 ? 0.12 : 0.17, 0.1);

// ------------------------------------------------------------------ paper and pencil
/** Paper: a crinkled, short rustle (planning cards being placed). */
function paper(t, len, gain, pan) {
  const bp = bandpass();
  let am = 0;
  put(t, len, gain, pan, (i, x) => {
    if (i % 96 === 0) am = 0.25 + rnd() * 0.75;
    const env = Math.sin(Math.PI * Math.min(1, x / len)) ** 0.7;
    return bp(noise(), 2500 + 1800 * Math.sin(x * 40), 0.9) * am * env;
  });
}
paper(12.55, 0.42, 0.42, 0.2); // page turn into the planning
for (let i = 0; i < 6; i++) paper(13.3 + i * 0.32, 0.11, 0.3, i % 2 ? 0.3 : -0.3);

/** Pencil ticking an item off the list: a short scratch. */
function pencil(t, gain, pan) {
  const bp = bandpass();
  put(t, 0.16, gain, pan, (i, x) => {
    const env = Math.min(1, x / 0.01) * Math.exp(-x * 18);
    const grain = 0.5 + 0.5 * Math.sin(2 * Math.PI * 90 * x + noise() * 0.6);
    return bp(noise(), 3800 + 2600 * x * 6, 1.2) * env * grain;
  });
}
paper(16.5, 0.3, 0.3, -0.2); // the list slides in
[18.4, 18.9, 19.4].forEach((t, i) => pencil(t, 0.5, -0.2 + i * 0.2));

// ------------------------------------------------------------------ interface
/** Soft tap on glass. */
function tap(t, gain = 0.2, pan = 0) {
  put(
    t,
    0.05,
    gain,
    pan,
    (i, x) => (Math.sin(2 * Math.PI * 1700 * x) * 0.6 + noise() * 0.4) * Math.exp(-x * 140),
  );
}
/** Air movement for the screen transitions. */
function whoosh(t, len, gain, from, to, pan0 = -0.5, pan1 = 0.5) {
  const bp = bandpass();
  const n = Math.round(len * SR);
  const s0 = Math.round(t * SR);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const v = bp(noise(), from * Math.pow(to / from, x), 1.1) * Math.sin(Math.PI * x) ** 1.5 * gain;
    const p = pan0 + (pan1 - pan0) * x;
    const k = s0 + i;
    if (k >= N) break;
    L[k] += v * Math.cos(((p + 1) * Math.PI) / 4);
    R[k] += v * Math.sin(((p + 1) * Math.PI) / 4);
  }
}
/** Marimba-like note for the moments that matter (recipe saved, logo). */
function chime(t, note, gain, pan) {
  const f = midi(note);
  put(
    t,
    1.4,
    gain,
    pan,
    (i, x) =>
      (Math.sin(2 * Math.PI * f * x) +
        0.25 * Math.sin(2 * Math.PI * 4 * f * x) * Math.exp(-x * 30)) *
      Math.exp(-x * 3.2) *
      Math.min(1, x / 0.002),
  );
}

whoosh(2.5, 0.8, 0.5, 250, 1800, 0, 0); // the recipes are pulled into the phone
tap(3.6, 0.18, 0.3); // share button
whoosh(3.9, 0.45, 0.22, 500, 1400, 0, 0); // share sheet slides up
tap(5.02, 0.24, 0); // PepperedApron
whoosh(5.75, 0.5, 0.3, 1600, 400); // to the import screen
chime(6.5, 79, 0.05, 0.2); // listening starts
whoosh(8.0, 0.6, 0.35, 300, 1500, 0, 0); // recipe slides up
chime(8.62, 76, 0.16, -0.2); // "Recette enregistrée"
chime(8.78, 83, 0.13, 0.2);
tap(10.97, 0.2, 0.1); // stepper +
[0, 1, 2, 3, 4].forEach((i) => tick(11.15 + i * 0.07, 0.07, 0.2, 5200)); // quantities flip
whoosh(16.5, 0.5, 0.25, 1800, 500);
whoosh(20.5, 0.5, 0.25, 600, 1600);
tap(21.77, 0.2, 0.1); // "Lancer 08:00"
whoosh(24.55, 1.1, 0.35, 300, 2200, 0, 0); // to the logo
chime(25.05, 72, 0.14, -0.15);
chime(25.25, 79, 0.12, 0.15);
chime(25.45, 84, 0.1, 0);

// ------------------------------------------------------------------ master
// Fade in/out, gentle saturation, normalise to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const x = i / SR;
  const fade = Math.min(1, x / 0.4, (DUR - x) / 1.2);
  L[i] = Math.tanh(L[i] * 1.3 * fade);
  R[i] = Math.tanh(R[i] * 1.3 * fade);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / (peak || 1);
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0);
out.writeUInt32LE(36 + N * 4, 4);
out.write('WAVEfmt ', 8);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write('data', 36);
out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
const file = process.argv[2] ?? new URL('./out/soundtrack.wav', import.meta.url).pathname;
fs.mkdirSync(new URL('./out/', import.meta.url).pathname, { recursive: true });
fs.writeFileSync(file, out);
console.info(file);
