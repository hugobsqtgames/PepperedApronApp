import { File, Paths } from 'expo-file-system';

/**
 * A JavaScript error that nothing caught no longer closes the app: it is kept (shown on screen,
 * and saved for Help → "Dernière erreur") and the app goes on. In development, React Native's
 * red screen is kept.
 */
export interface CrashReport {
  message: string;
  stack: string;
  at: string;
  where?: string;
}

type Handler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): Handler;
  setGlobalHandler(h: Handler): void;
}

const listeners = new Set<(r: CrashReport) => void>();
let installed = false;

const file = () => new File(Paths.document, 'last-error.json');

export function reportOf(error: unknown, where?: string): CrashReport {
  const e = error instanceof Error ? error : new Error(String(error));
  return {
    message: `${e.name}: ${e.message}`.slice(0, 500),
    stack: (e.stack ?? '').split('\n').slice(0, 25).join('\n'),
    at: new Date().toISOString(),
    where,
  };
}

/** Saves the report for Help, and tells the screen showing it. */
export function recordCrash(report: CrashReport, notify = true) {
  try {
    void Promise.resolve(file().write(JSON.stringify(report))).catch(() => undefined);
  } catch {
    // Not saved: still shown.
  }
  // Only the screen on top shows it (cook mode is above the app).
  if (notify) [...listeners].pop()?.(report);
}

export function onCrash(l: (r: CrashReport) => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function lastCrash(): CrashReport | null {
  try {
    const f = file();
    return f.exists ? (JSON.parse(f.textSync()) as CrashReport) : null;
  } catch {
    return null;
  }
}

export function clearLastCrash() {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Nothing to clear.
  }
}

export function installCrashGuard() {
  const EU = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !EU) return;
  installed = true;
  const previous = EU.getGlobalHandler();
  EU.setGlobalHandler((error, isFatal) => {
    if (__DEV__) return previous(error, isFatal);
    recordCrash(reportOf(error, isFatal ? 'fatal' : 'error'));
  });
}
