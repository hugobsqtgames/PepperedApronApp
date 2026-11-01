import { useSyncExternalStore } from 'react';
import { importQueue, type QueueState } from '../services/importQueue';

/**
 * The queue updates its jobs in place (the import holds its job and changes its status). What a
 * screen gets is a copy made once per change, so a job that went from "waiting" to "done" is a
 * new object: effects and lists that depend on it see the change (they compare by identity).
 */
let lastState: QueueState | null = null;
let lastCopy: QueueState | null = null;
function snapshot(): QueueState {
  const s = importQueue.snapshot;
  if (s !== lastState || !lastCopy) {
    lastState = s;
    lastCopy = { ...s, jobs: s.jobs.map((j) => ({ ...j })) };
  }
  return lastCopy;
}

/** Imports in progress (shared recipes, lists of links, Instagram export). */
export function useImportQueue() {
  return useSyncExternalStore((cb) => importQueue.subscribe(cb), snapshot);
}
