import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { uuidv7, type ReviewNotice } from '@pepperedapron/core';
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
const MAX_JOBS = 2000;
const MAX_ATTEMPTS = 3;
/** Instagram blocks a phone that reads too many posts too fast: pace and back off. */
const INSTAGRAM_GAP_MS = 4000;
const OTHER_GAP_MS = 1500;
const BLOCKED_PAUSE_MS = 15 * 60_000;
const OFFLINE_PAUSE_MS = 60_000;

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
  private running = false;
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
    if (!s) return;
    try {
      const raw = await s.store.meta(META_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<QueueState> | null) : null;
      // A damaged or older state must not stop the imports: keep only well-formed jobs.
      if (saved && typeof saved === 'object')
        this.state = {
          ...this.state,
          ...saved,
          jobs: Array.isArray(saved.jobs)
            ? saved.jobs.filter(
                (j) =>
                  j && typeof j.id === 'string' && j.source && typeof j.source.kind === 'string',
              )
            : [],
        };
    } catch {
      // Unreadable: start empty.
    }
    // A job interrupted by the app being closed starts again.
    for (const j of this.state.jobs) if (j.status === 'running') j.status = 'pending';
    this.loaded = true;
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
      // Only what is needed to resume: finished jobs beyond the most recent ones are dropped.
      const done = this.state.jobs.filter((j) => j.status === 'done' || j.status === 'duplicate');
      if (done.length > 300) {
        const old = new Set(done.slice(0, done.length - 300).map((j) => j.id));
        this.state.jobs = this.state.jobs.filter((j) => !old.has(j.id));
      }
      await s.store.setMeta(META_KEY, JSON.stringify(this.state));
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
    for (const { source, collection } of sources.slice(0, MAX_JOBS)) {
      const id = uuidv7();
      ids.push(id);
      this.state.jobs.push({
        id,
        source: await keepFiles(source, id),
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
    if (this.running) return;
    await this.load();
    if (!this.loaded) return;
    this.running = true;
    try {
      for (;;) {
        const wait = this.state.pausedUntil - Date.now();
        if (wait > 0) {
          if (this.wake) clearTimeout(this.wake);
          this.wake = setTimeout(() => void this.run(), wait + 500);
          break;
        }
        if (this.state.pauseReason) {
          this.state.pauseReason = null;
          this.emit();
        }
        const job = this.state.jobs.find((j) => j.status === 'pending');
        if (!job) break;
        await this.process(job);
        if (job.batch && this.state.jobs.some((j) => j.status === 'pending'))
          await sleep(isInstagram(job.source) ? INSTAGRAM_GAP_MS : OTHER_GAP_MS);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(job: ImportJob) {
    job.status = 'running';
    job.stage = null;
    job.attempts++;
    this.emit();
    try {
      const prepared = await prepareImport(job.source, (stage) => {
        job.stage = stage;
        this.emit();
      });
      if (prepared.offline) {
        // No network: try again later rather than saving an empty recipe.
        Object.assign(job, { status: 'pending', stage: null, error: 'offline' });
        if (job.attempts >= MAX_ATTEMPTS * 3) job.status = 'failed';
        this.state.pausedUntil = Date.now() + OFFLINE_PAUSE_MS;
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
      const saved = await saveImport(prepared, { force: job.force, collection: job.collection });
      Object.assign(job, {
        status: saved.duplicate ? 'duplicate' : 'done',
        stage: null,
        recipeId: saved.recipeId,
        title: saved.title,
        notice: prepared.notice,
        error: null,
      });
      dropFiles(job);
    } catch (e) {
      console.warn('[import] failed', (e as Error).message);
      Object.assign(job, {
        status: job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
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
