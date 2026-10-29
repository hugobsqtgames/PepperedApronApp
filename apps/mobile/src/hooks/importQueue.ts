import { useSyncExternalStore } from 'react';
import { importQueue } from '../services/importQueue';

/** Imports in progress (shared recipes, lists of links, Instagram export). */
export function useImportQueue() {
  return useSyncExternalStore(
    (cb) => importQueue.subscribe(cb),
    () => importQueue.snapshot,
  );
}
