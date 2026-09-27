import type { SyncRecord } from '@pepperedapron/core';
import { ApiError, NetworkError, type ApiClient } from './api';
import type { LocalStore } from './store';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'signedOut';

export interface SyncSnapshot {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: string | null;
  /** User-facing error code (never a technical message). */
  error: string | null;
}

export interface SyncEngineOptions {
  /** Base delay for exponential backoff (ms). */
  retryBaseMs?: number;
  retryMaxMs?: number;
  pushBatch?: number;
  pullLimit?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  onSignedOut?: () => void;
}

/**
 * Push local changes, then pull remote ones. Single-flight: concurrent calls share one run and a
 * run requested meanwhile is performed right after. Transient failures back off exponentially.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private timer: unknown = null;
  private snap: SyncSnapshot = { status: 'idle', pending: 0, lastSyncedAt: null, error: null };
  private listeners = new Set<(s: SyncSnapshot) => void>();
  private stopped = false;

  constructor(private readonly store: LocalStore, private readonly api: ApiClient, private readonly o: SyncEngineOptions = {}) {}

  get snapshot() {
    return this.snap;
  }
  subscribe(fn: (s: SyncSnapshot) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private set(p: Partial<SyncSnapshot>) {
    this.snap = { ...this.snap, ...p };
    for (const l of this.listeners) l(this.snap);
  }

  stop() {
    this.stopped = true;
    if (this.timer) (this.o.clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>);
  }

  start() {
    this.stopped = false;
  }

  sync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again && !this.stopped);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce() {
    this.set({ status: 'syncing', pending: await this.store.pendingCount() });
    try {
      await this.pushAll();
      await this.pullAll();
      this.failures = 0;
      this.set({ status: 'idle', error: null, lastSyncedAt: new Date().toISOString(), pending: await this.store.pendingCount() });
    } catch (e) {
      const pending = await this.store.pendingCount();
      if (e instanceof ApiError && (e.status === 401 || e.code === 'session_expired')) {
        this.set({ status: 'signedOut', pending, error: 'session_expired' });
        this.o.onSignedOut?.();
        return;
      }
      this.failures++;
      const offline = e instanceof NetworkError;
      this.set({ status: offline ? 'offline' : 'error', pending, error: offline ? 'offline' : 'sync_failed' });
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const base = this.o.retryBaseMs ?? 2000;
    const max = this.o.retryMaxMs ?? 5 * 60_000;
    const delay = Math.min(max, base * 2 ** Math.min(this.failures - 1, 10)) * (0.75 + Math.random() * 0.5);
    const set = this.o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    if (this.timer) (this.o.clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>);
    this.timer = set(() => void this.sync(), delay);
  }

  private async pushAll() {
    for (let guard = 0; guard < 1000; guard++) {
      const ops = await this.store.takeOps(this.o.pushBatch ?? 100);
      if (!ops.length) return;
      let res;
      try {
        res = await this.api.push(ops.map(({ seq: _s, attempts: _a, ...op }) => op));
      } catch (e) {
        await this.store.releaseOps(ops.map((o) => o.seq), e instanceof ApiError ? e.code : 'network');
        throw e;
      }
      const byOp = new Map(res.results.map((r) => [r.opId, r]));
      for (const op of ops) {
        const verdict = byOp.get(op.opId);
        if (!verdict) {
          await this.store.releaseOps([op.seq], 'missing_result');
          continue;
        }
        await this.store.resolveOp(op, verdict);
      }
      await this.checkEpoch(res.scopeEpoch);
    }
  }

  private async checkEpoch(epoch: number) {
    const known = await this.store.meta('scope_epoch');
    if (known !== null && Number(known) !== epoch) {
      await this.store.resetForResync();
    }
    if (known === null || Number(known) !== epoch) await this.store.setMeta('scope_epoch', String(epoch));
  }

  private async pullAll() {
    for (let guard = 0; guard < 10_000; guard++) {
      const cursor = Number((await this.store.meta('cursor')) ?? 0);
      const page = await this.api.pull(cursor, this.o.pullLimit ?? 500);
      const known = await this.store.meta('scope_epoch');
      if (known !== null && Number(known) !== page.scopeEpoch) {
        await this.store.resetForResync();
        await this.store.setMeta('scope_epoch', String(page.scopeEpoch));
        continue;
      }
      if (known === null) await this.store.setMeta('scope_epoch', String(page.scopeEpoch));
      await this.store.applyPulled(page.records as SyncRecord[], page.cursor);
      if (!page.hasMore) return;
    }
  }
}
