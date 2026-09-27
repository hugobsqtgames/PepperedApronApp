/**
 * Kitchen timers are stored as absolute timestamps so they survive navigation, app suspension
 * and restarts; the UI only derives the remaining time.
 */
export interface KitchenTimer {
  id: string;
  label: string;
  durationSeconds: number;
  /** Epoch ms when the timer ends, when running. */
  endsAt: number | null;
  /** Remaining seconds when paused. */
  pausedRemaining: number | null;
  recipeId: string | null;
  stepIndex: number | null;
  notificationId: string | null;
}

export type TimerState = 'running' | 'paused' | 'done';

export function createTimer(p: { id: string; label: string; durationSeconds: number; recipeId?: string | null; stepIndex?: number | null }, now: number): KitchenTimer {
  return {
    id: p.id,
    label: p.label,
    durationSeconds: p.durationSeconds,
    endsAt: now + p.durationSeconds * 1000,
    pausedRemaining: null,
    recipeId: p.recipeId ?? null,
    stepIndex: p.stepIndex ?? null,
    notificationId: null,
  };
}

export function remainingSeconds(t: KitchenTimer, now: number): number {
  if (t.pausedRemaining !== null) return t.pausedRemaining;
  if (t.endsAt === null) return 0;
  return Math.max(0, (t.endsAt - now) / 1000);
}

export function timerState(t: KitchenTimer, now: number): TimerState {
  if (t.pausedRemaining !== null) return 'paused';
  return remainingSeconds(t, now) <= 0 ? 'done' : 'running';
}

export function pauseTimer(t: KitchenTimer, now: number): KitchenTimer {
  if (timerState(t, now) !== 'running') return t;
  return { ...t, pausedRemaining: remainingSeconds(t, now), endsAt: null };
}

export function resumeTimer(t: KitchenTimer, now: number): KitchenTimer {
  if (t.pausedRemaining === null) return t;
  return { ...t, endsAt: now + t.pausedRemaining * 1000, pausedRemaining: null };
}

export function addTime(t: KitchenTimer, seconds: number, now: number): KitchenTimer {
  if (t.pausedRemaining !== null) return { ...t, pausedRemaining: Math.max(0, t.pausedRemaining + seconds) };
  const base = Math.max(now, t.endsAt ?? now);
  return { ...t, endsAt: base + seconds * 1000, durationSeconds: t.durationSeconds + seconds };
}
