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
  /** "Turn it over" halfway, "stir" now and then (see stepReminders). */
  reminders?: { after: number; kind: 'flip' | 'stir' | 'baste' }[];
}

export type TimerState = 'running' | 'paused' | 'done';

export function createTimer(
  p: {
    id: string;
    label: string;
    durationSeconds: number;
    recipeId?: string | null;
    stepIndex?: number | null;
  },
  now: number,
): KitchenTimer {
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
  if (t.pausedRemaining !== null)
    return { ...t, pausedRemaining: Math.max(0, t.pausedRemaining + seconds) };
  const base = Math.max(now, t.endsAt ?? now);
  return { ...t, endsAt: base + seconds * 1000, durationSeconds: t.durationSeconds + seconds };
}

export type TimerReminderKind = 'flip' | 'stir' | 'baste';
/** A reminder during a timer: `after` seconds from its start ("turn the chicken halfway"). */
export interface TimerReminder {
  after: number;
  kind: TimerReminderKind;
}

/**
 * What the step asks to do while it cooks: turn halfway ("retourner à mi-cuisson", "flip"),
 * stir now and then ("remuer de temps en temps", "toutes les 5 min"), baste a roast. Only for
 * timers of 2 minutes or more; never in the last 30 seconds.
 */
export function stepReminders(text: string, seconds: number): TimerReminder[] {
  if (!(seconds >= 120)) return [];
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const out: TimerReminder[] = [];
  const every = (min: number, kind: TimerReminderKind, max: number) => {
    for (
      let a = min * 60;
      a < seconds - 30 && out.filter((r) => r.kind === kind).length < max;
      a += min * 60
    )
      out.push({ after: a, kind });
  };
  if (/\b(retourn\w*|a mi[- ]cuisson|halfway|flip\w*|turn\w* (?:it |them )?over)\b/.test(t))
    out.push({ after: Math.round(seconds / 2), kind: 'flip' });
  const stir =
    /\b(remu\w*|melang\w*|tourn\w*|stir\w*)\b[^.]{0,40}\b(de temps en temps|regulierement|souvent|frequemment|occasionally|frequently|often|every|toutes les)\b/.test(
      t,
    );
  if (stir) {
    const m = /(?:toutes les|every)\s*(\d{1,2})\s*(?:min|minutes?)/.exec(t);
    every(m ? Math.max(1, Number(m[1])) : seconds >= 1200 ? 5 : 3, 'stir', 6);
  }
  if (/\b(arros\w*|bast\w*)\b/.test(t) && seconds >= 1200) every(20, 'baste', 4);
  return out.sort((a, b) => a.after - b.after);
}
