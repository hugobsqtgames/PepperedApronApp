import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SyncEntity } from '@pepperedapron/core';
import type { CloudSnapshot, Repos } from '@pepperedapron/client';
import { runtime, type Session } from '../services/runtime';

let runtimeVersion = 0;
runtime.subscribe(() => {
  runtimeVersion++;
});

/** Re-render when runtime state (boot, iCloud preference) changes. */
export function useRuntime() {
  useSyncExternalStore(
    (cb) => runtime.subscribe(cb),
    () => runtimeVersion,
  );
  return runtime;
}

export function useSession(): Session {
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

/** iCloud sync state ('off' when the user turned it off on this device). */
export function useCloudStatus(): CloudSnapshot {
  const cloud = useSession().cloud;
  return useSyncExternalStore(
    (cb) => cloud.subscribe(cb),
    () => cloud.snapshot,
  );
}

export function useSettings() {
  return useLive(['settings'], (r) => r.settings());
}
