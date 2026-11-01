import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { canonicalUrl, uuidv7, type ReviewNotice } from '@pepperedapron/core';
import { prepareImport, saveImport, type ImportSource, type ImportStage } from './autoImport';
import { runtime } from './runtime';

export type JobStatus = 'pending' | 'running' | 'done' | 'duplicate' | 'failed';

export interface ImportJob {
  id: string;
  source: ImportSource;
  /** Part of a bulk import (list of links, Instagram export): paced, and never saves a bare link. */
  batch: boolean;
  /** Collection to put the recipe in (Instagram collections). */
  collection: string | null;
  /** Save even if the recipe looks like one already in the library. */
  force: boolean;
  status: JobStatus;
  stage: ImportStage | null;
  attempts: number;
  recipeId: string | null;
  title: string | null;
  notice: ReviewNotice | null;
  error: 'offline' | 'blocked' | 'failed' | null;
  addedAt: number;
}

export interface QueueState {
  jobs: ImportJob[];
  /** Imports wait until then (no network, or Instagram asking to slow down). */
  pausedUntil: number;
  pauseReason: 'offline' | 'blocked' | null;
}

const META_KEY = 'import_queue';
const LOG_KEY = 'import_log';
const MAX_JOBS = 2000;
const MAX_ATTEMPTS = 3;
/** Instagram blocks a phone that reads too many posts too fast: pace and back off. */
const INSTAGRAM_GAP_MS = 4000;
const OTHER_GAP_MS = 1500;
const BLOCKED_PAUSE_MS = 15 * 60_000;
const OFFLINE_PAUSE_MS = 60_000;
const HAND_OFFLINE_PAUSE_MS = 15_000;
/** One import never takes longer (a video that never finishes downloading must not block the rest). */
const JOB_TIMEOUT_MS = 4 * 60_000;
/** The same thing shared again within this delay is the same share (iOS can deliver it twice). */
const SAME_SHARE_MS = 2 * 60_000;

/** What identifies a shared item: the same link, text or files. */
export function sourceKey(s: ImportSource): string {
  if (s.kind === 'link') return `link:${canonicalUrl(s.url) ?? s.url}`;
  if (s.kind === 'text') return `text:${s.text.trim()}`;
  if (s.kind === 'photos') return `photos:${s.uris.join('|')}`;
  return `${s.kind}:${s.uri}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

const inbox = () => new Directory(Paths.document, 'import-inbox');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isInstagram = (s: ImportSource) => s.kind === 'link' && /instagram\.com/i.test(s.url);

function filesOf(s: ImportSource): string[] {
  return s.kind === 'photos' ? s.uris : s.kind === 'video' || s.kind === 'pdf' ? [s.uri] : [];
}

/** Shared files live in the share extension's folder, which iOS may empty: keep a copy. */
async function keepFiles(s: ImportSource, jobId: string): Promise<ImportSource> {
  const copy = async (uri: string, n: number) => {
    try {
      const dir = inbox();
      if (!dir.exists) dir.create({ intermediates: true });
      const ext = uri.match(/\.(\w{2,5})$/)?.[1] ?? 'bin';
      const dest = new File(dir, `${jobId}-${n}.${ext}`);
      await new File(uri).copy(dest);
      return dest.uri;
    } catch {
      return uri;
    }
  };
  if (s.kind === 'photos') return { ...s, uris: await Promise.all(s.uris.map(copy)) };
  if (s.kind === 'video' || s.kind === 'pdf') return { ...s, uri: await copy(s.uri, 0) };
  return s;
}

function dropFiles(job: ImportJob) {
  for (const uri of filesOf(job.source)) {
    if (!uri.includes('/import-inbox/')) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
}

/**
 * Imports run one after the other, on the phone, even after the app was closed: the queue is
 * kept in the local database (this device only). Sharing several posts in a row from Instagram
 * just adds them here; each one becomes a saved recipe.
 */
class ImportQueue {
  private state: QueueState = { jobs: [], pausedUntil: 0, pauseReason: null };
  private loaded = false;
  /** What the queue did, newest last (Help → "Send the import log"), to find why one waited. */
  private logLines: string[] = [];
  /**
   * Two lanes: what the user shares by hand never waits behind a bulk import (an Instagram
   * export of hundreds of posts, paced to avoid being blocked).
   */
  private running = { hand: false, batch: false };
  private wake: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: QueueState) => void>();

  constructor() {
    AppState.addEventListener('change', (s) => {
      if (s === 'active') void this.run();
    });
  }

  get snapshot() {
    return this.state;
  }
  subscribe(fn: (s: QueueState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private async load() {
    if (this.loaded) return;
    const s = runtime.session;
    if (!s) {
      this.log('load: data not open yet');
      return;
    }
    try {
      const rawLog = await s.store.meta(LOG_KEY);
      const oldLog: unknown = rawLog ? JSON.parse(rawLog) : [];
      if (Array.isArray(oldLog))
        this.logLines = [...oldLog.filter((l) => typeof l === 'string'), ...this.logLines].slice(
          -300,
        );
      const raw = await s.store.meta(META_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<QueueState> | null) : null;
      // A damaged or older state must not stop the imports: keep only well-formed jobs.
      if (saved && typeof saved === 'object') {
        const kept = Array.isArray(saved.jobs)
          ? saved.jobs.filter(
              (j) => j && typeof j.id === 'string' && j.source && typeof j.source.kind === 'string',
            )
          : [];
        // Something shared before the data was open stays (it was only in memory).
        const ids = new Set(kept.map((j) => j.id));
        this.state = {
          ...this.state,
          ...saved,
          jobs: [...kept, ...this.state.jobs.filter((j) => !ids.has(j.id))],
        };
      }
    } catch {
      // Unreadable: start empty.
    }
    // A job interrupted by the app being closed starts again; an older saved job without its
    // lane is a hand-shared one (it would otherwise be picked by no lane and wait for ever).
    for (const j of this.state.jobs) {
      if (j.status === 'running') j.status = 'pending';
      j.batch = j.batch === true;
    }
    this.log(`loaded ${this.state.jobs.length} jobs`);
    this.loaded = true;
  }

  private log(msg: string) {
    this.logLines.push(`${new Date().toISOString().slice(5, 19)} ${msg}`);
    if (this.logLines.length > 300) this.logLines.splice(0, this.logLines.length - 300);
  }

  /** The import log, oldest first (shown nowhere: sent by the user from Help when asked). */
  importLog(): string[] {
    return [...this.logLines];
  }

  /**
   * The recipe an import already led to, when its job never finished on screen (the same post
   * saved by another share of it): same link, or — for a short link that the site redirected —
   * the only recipe from that site saved since the share. Null when unsure.
   */
  savedRecipeFor(id: string): string | null {
    const s = runtime.session;
    const job = this.state.jobs.find((j) => j.id === id);
    if (!s || !job || job.source.kind !== 'link') return null;
    const want = canonicalUrl(job.source.url) ?? job.source.url;
    const recipes = s.repos.recipes();
    const same = recipes.find(
      (r) => r.data.sourceUrl && (canonicalUrl(r.data.sourceUrl) ?? r.data.sourceUrl) === want,
    );
    if (same) return same.id;
    let host: string;
    try {
      host = new URL(job.source.url).hostname.replace(/^(www|vm|vt|m)\./, '');
    } catch {
      return null;
    }
    const since = job.addedAt - 60_000;
    const recent = recipes.filter((r) => {
      if (!r.data.sourceUrl || Date.parse(r.updatedAt) < since) return false;
      try {
        return new URL(r.data.sourceUrl).hostname.replace(/^(www|vm|vt|m)\./, '') === host;
      } catch {
        return false;
      }
    });
    return recent.length === 1 ? recent[0]!.id : null;
  }

  private emit() {
    this.state = { ...this.state, jobs: [...this.state.jobs] };
    for (const l of this.listeners) l(this.state);
  }

  /**
   * Show the change now; write it to the database shortly after (a long import changes the queue
   * every few seconds). A change lost in a crash only means an import is done again — and the
   * recipe is then recognised as already saved.
   */
  private persist() {
    this.emit();
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.write();
    }, 1500);
  }

  private async write() {
    const s = runtime.session;
    if (!s) return;
    try {
      // Only what is needed to resume: finished jobs beyond the most recent ones are dropped —
      // once nothing is running, so the progress of a big import ("650 of 1000") stays right.
      const done = this.state.jobs.filter((j) => j.status === 'done' || j.status === 'duplicate');
      const busy = this.state.jobs.some((j) => j.status === 'pending' || j.status === 'running');
      if (!busy && done.length > 300) {
        const old = new Set(done.slice(0, done.length - 300).map((j) => j.id));
        this.state.jobs = this.state.jobs.filter((j) => !old.has(j.id));
      }
      await s.store.setMeta(META_KEY, JSON.stringify(this.state));
      await s.store.setMeta(LOG_KEY, JSON.stringify(this.logLines));
    } catch {
      // Not critical: the jobs in memory still run.
    }
  }

  /** Add imports; returns their ids. */
  async add(
    sources: { source: ImportSource; collection?: string | null }[],
    opts: { batch?: boolean } = {},
  ): Promise<string[]> {
    await this.load();
    const ids: string[] = [];
    const now = Date.now();
    for (const { source, collection } of sources.slice(0, MAX_JOBS)) {
      // Shared twice (iOS delivers the share when the app starts and again when it comes
      // forward), or tapped twice: one import, not two.
      const key = sourceKey(source);
      const same = this.state.jobs.find(
        (j) =>
          sourceKey(j.source) === key &&
          (j.status === 'pending' || j.status === 'running' || now - j.addedAt < SAME_SHARE_MS),
      );
      if (same) {
        this.log(`add: same as ${same.id.slice(-6)} (${same.status}) ${key.slice(0, 80)}`);
        // Shared again by hand while it waits among a bulk import (paced, maybe paused): it
        // moves to the hand lane and runs now.
        if (!opts.batch && same.batch && same.status === 'pending') same.batch = false;
        ids.push(same.id);
        continue;
      }
      const id = uuidv7();
      ids.push(id);
      // Copied before reading `this.state.jobs`: while the copy is awaited, a running import
      // replaces the list (emit), and a push into the old one would lose this job.
      const kept = await keepFiles(source, id);
      this.state.jobs.push({
        id,
        source: kept,
        batch: opts.batch ?? false,
        collection: collection ?? null,
        force: false,
        status: 'pending',
        stage: null,
        attempts: 0,
        recipeId: null,
        title: null,
        notice: null,
        error: null,
        addedAt: Date.now(),
      });
      this.log(`add ${id.slice(-6)}${opts.batch ? ' (bulk)' : ''} ${key.slice(0, 80)}`);
    }
    // Something shared by hand is worth retrying now, even after a pause.
    if (!opts.batch && this.state.pauseReason === 'offline') this.state.pausedUntil = 0;
    this.emit();
    // What was shared is written at once: it must survive the app being closed right away.
    await this.write();
    void this.run();
    return ids;
  }

  async start() {
    await this.load();
    this.emit();
    void this.run();
  }

  async retryFailed() {
    for (const j of this.state.jobs)
      if (j.status === 'failed') Object.assign(j, { status: 'pending', attempts: 0, error: null });
    this.state.pausedUntil = 0;
    this.state.pauseReason = null;
    this.persist();
    void this.run();
  }

  /** The recipe looked like one already saved: save it anyway. */
  async saveAnyway(id: string) {
    const j = this.state.jobs.find((x) => x.id === id);
    if (!j) return;
    Object.assign(j, { force: true, status: 'pending', error: null, attempts: 0 });
    this.persist();
    void this.run();
  }

  async remove(id: string) {
    const j = this.state.jobs.find((x) => x.id === id);
    if (!j || j.status === 'running') return;
    dropFiles(j);
    this.state.jobs = this.state.jobs.filter((x) => x.id !== id);
    this.persist();
  }

  /** Forget finished and failed imports (the recipes stay). */
  async clearFinished() {
    for (const j of this.state.jobs)
      if (j.status !== 'pending' && j.status !== 'running') dropFiles(j);
    this.state.jobs = this.state.jobs.filter(
      (j) => j.status === 'pending' || j.status === 'running',
    );
    this.persist();
  }

  private async run() {
    await this.load();
    if (!this.loaded) {
      this.log('run: not loaded');
      return;
    }
    void this.runLane(false);
    void this.runLane(true);
  }

  private async runLane(batch: boolean) {
    const lane = batch ? 'batch' : 'hand';
    if (this.running[lane]) return;
    this.running[lane] = true;
    this.log(`${lane}: start`);
    try {
      for (;;) {
        // No network stops both lanes; Instagram slowing the phone down only stops bulk imports.
        const paused =
          this.state.pausedUntil > Date.now() && (batch || this.state.pauseReason === 'offline');
        if (paused) {
          this.log(
            `${lane}: paused (${this.state.pauseReason}) ${Math.round((this.state.pausedUntil - Date.now()) / 1000)} s`,
          );
          if (this.wake) clearTimeout(this.wake);
          this.wake = setTimeout(() => void this.run(), this.state.pausedUntil - Date.now() + 500);
          break;
        }
        if (this.state.pauseReason && this.state.pausedUntil <= Date.now()) {
          this.state.pauseReason = null;
          this.emit();
        }
        const job = this.state.jobs.find((j) => j.status === 'pending' && j.batch === batch);
        if (!job) break;
        await this.process(job);
        if (batch && this.state.jobs.some((j) => j.status === 'pending' && j.batch))
          await sleep(isInstagram(job.source) ? INSTAGRAM_GAP_MS : OTHER_GAP_MS);
      }
    } finally {
      this.running[lane] = false;
      this.log(`${lane}: idle`);
    }
  }

  private async process(job: ImportJob) {
    job.status = 'running';
    job.stage = null;
    job.attempts++;
    this.log(`run ${job.id.slice(-6)} try ${job.attempts}`);
    this.emit();
    // The whole import, saving included, has a time limit: past it, the job is given up (it can
    // be retried by hand) and the next ones go on.
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    const left = () => Math.max(1000, deadline - Date.now());
    try {
      const prepared = await withTimeout(
        prepareImport(job.source, (stage) => {
          this.log(`${job.id.slice(-6)} ${stage}`);
          job.stage = stage;
          this.emit();
        }),
        left(),
      );
      if (prepared.offline) {
        this.log(`${job.id.slice(-6)} offline`);
        // No network: try again later rather than saving an empty recipe.
        Object.assign(job, { status: 'pending', stage: null, error: 'offline' });
        if (job.attempts >= MAX_ATTEMPTS * 3) job.status = 'failed';
        // Shared by hand: tried again soon (the person is waiting for it).
        this.state.pausedUntil =
          Date.now() + (job.batch ? OFFLINE_PAUSE_MS : HAND_OFFLINE_PAUSE_MS);
        this.state.pauseReason = 'offline';
        return;
      }
      // In a bulk import, an Instagram post read without its caption means Instagram is
      // limiting this phone (or the account is private): wait instead of saving bare links.
      if (job.batch && prepared.notice === 'instagram') {
        Object.assign(job, { stage: null, error: 'blocked' });
        if (job.attempts >= MAX_ATTEMPTS) job.status = 'failed';
        else {
          job.status = 'pending';
          this.state.pausedUntil = Date.now() + BLOCKED_PAUSE_MS;
          this.state.pauseReason = 'blocked';
        }
        return;
      }
      job.stage = 'saving';
      this.emit();
      const saved = await withTimeout(
        saveImport(prepared, { force: job.force, collection: job.collection }),
        left(),
      );
      Object.assign(job, {
        status: saved.duplicate ? 'duplicate' : 'done',
        stage: null,
        recipeId: saved.recipeId,
        title: saved.title,
        notice: prepared.notice,
        error: null,
      });
      dropFiles(job);
      this.log(`${job.id.slice(-6)} ${job.status}`);
    } catch (e) {
      console.warn('[import] failed', (e as Error).message);
      this.log(`${job.id.slice(-6)} error: ${(e as Error).message}`.slice(0, 200));
      // Too long once: trying again would only block the queue as long again.
      const timedOut = (e as Error).message === 'timeout';
      Object.assign(job, {
        status: timedOut || job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        stage: null,
        error: 'failed',
      });
      if (job.status === 'pending') await sleep(2000);
    } finally {
      this.persist();
    }
  }
}

export const importQueue = new ImportQueue();
