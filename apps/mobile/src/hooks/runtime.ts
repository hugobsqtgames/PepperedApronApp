import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SyncEntity } from '@pepperedapron/core';
import type { Repos, SyncSnapshot } from '@pepperedapron/client';
import { runtime, type UserSession } from '../services/runtime';

let runtimeVersion = 0;
runtime.subscribe(() => {
  runtimeVersion++;
});

/** Re-render when runtime state (auth, household, config) changes. */
export function useRuntime() {
  useSyncExternalStore(
    (cb) => runtime.subscribe(cb),
    () => runtimeVersion,
  );
  return runtime;
}

export function useSession(): UserSession {
  const rt = useRuntime();
  if (!rt.session) throw new Error('No active session');
  return rt.session;
}

export function useRepos(): Repos {
  return useSession().repos;
}

/**
 * Live query over the local store: `select` re-runs only when one of `entities` changes.
 * Results are served from memory, so this is instant and works offline.
 */
export function useLive<T>(
  entities: SyncEntity[],
  select: (repos: Repos) => T,
  deps: unknown[] = [],
): T {
  const session = useSession();
  const key = entities.join(',');
  const selectRef = useRef(select);
  selectRef.current = select;
  const compute = useCallback(() => selectRef.current(session.repos), [session, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = useState<T>(compute);
  useEffect(() => {
    setValue(compute());
    const watch = new Set(key.split(',') as SyncEntity[]);
    return session.store.subscribe((changed) => {
      for (const e of changed) {
        if (watch.has(e)) {
          setValue(compute());
          return;
        }
      }
    });
  }, [session, key, compute]);
  return value;
}

export function useSyncStatus(): SyncSnapshot {
  const session = useSession();
  return useSyncExternalStore(
    (cb) => session.sync.subscribe(cb),
    () => session.sync.snapshot,
  );
}

export function useSettings() {
  return useLive(['settings'], (r) => r.settings());
}
