import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  addTime,
  createTimer,
  pauseTimer,
  remainingSeconds,
  resumeTimer,
  timerState,
  uuidv7,
  type KitchenTimer,
} from '@pepperedapron/core';
import {
  cancelNotification,
  cancelTimerReminders,
  ensureNotificationPermission,
  scheduleTimerNotification,
  scheduleTimerReminder,
} from './notifications';

/** When each reminder of a running timer falls (ms), counted back from its end. */
function reminderTimes(
  t: KitchenTimer,
): { n: number; at: number; kind: 'flip' | 'stir' | 'baste' }[] {
  if (!t.endsAt || !t.reminders?.length) return [];
  return t.reminders.map((r, n) => ({
    n,
    kind: r.kind,
    at: t.endsAt! - (t.durationSeconds - r.after) * 1000,
  }));
}
import i18n from '../i18n';
import { haptic } from './haptics';

type Listener = (timers: KitchenTimer[]) => void;
const file = () => new File(Paths.document, 'kitchen-timers.json');

/**
 * Kitchen timers stored as absolute end times (survive navigation, backgrounding and restarts).
 * The OS delivers the "done" notification; on iPhone the nearest timer is mirrored in a Live
 * Activity (lock screen + Dynamic Island).
 */
class TimerManager {
  private timers: KitchenTimer[] = [];
  private listeners = new Set<Listener>();
  private reminderListeners = new Set<(t: KitchenTimer, kind: 'flip' | 'stir' | 'baste') => void>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private notified = new Set<string>();
  private liveActivityId: string | null = null;

  constructor() {
    try {
      const f = file();
      const saved: unknown = f.exists ? JSON.parse(f.textSync()) : [];
      // A damaged or older file must not break the timers: keep only well-formed ones.
      this.timers = Array.isArray(saved)
        ? (saved as KitchenTimer[]).filter(
            (t) =>
              t &&
              typeof t.id === 'string' &&
              typeof t.label === 'string' &&
              Number.isFinite(t.endsAt ?? t.pausedRemaining),
          )
        : [];
    } catch {
      this.timers = [];
    }
    this.ensureTick();
    AppState.addEventListener('change', (s) => s === 'active' && this.emit());
  }

  list() {
    return this.timers;
  }
  /** Reminders during a timer, for the screen to show them ("Retournez maintenant"). */
  onReminder(l: (t: KitchenTimer, kind: 'flip' | 'stir' | 'baste') => void) {
    this.reminderListeners.add(l);
    return () => {
      this.reminderListeners.delete(l);
    };
  }
  private async scheduleReminders(t: KitchenTimer) {
    await cancelTimerReminders(t.id);
    for (const r of reminderTimes(t))
      await scheduleTimerReminder(t.id, r.n, t.label, r.kind, r.at).catch(() => null);
  }
  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit() {
    for (const l of this.listeners) l([...this.timers]);
  }
  private persist() {
    try {
      file().write(JSON.stringify(this.timers));
    } catch {
      /* non critical */
    }
  }
  private ensureTick() {
    if (this.tick || !this.timers.length) return;
    this.tick = setInterval(() => {
      const now = Date.now();
      for (const t of this.timers) {
        // "Turn it over": while the app is open, felt and heard (VoiceOver) at the right time.
        if (timerState(t, now) === 'running')
          for (const r of reminderTimes(t)) {
            const key = `${t.id}:r${r.n}:${r.at}`;
            if (now >= r.at && now - r.at < 5000 && !this.notified.has(key)) {
              this.notified.add(key);
              haptic.timerDone();
              AccessibilityInfo.announceForAccessibility(
                i18n.t(`timerReminders.${r.kind}`, { label: t.label }),
              );
              for (const l of this.reminderListeners) l(t, r.kind);
            }
          }
        if (timerState(t, now) === 'done' && !this.notified.has(t.id)) {
          this.notified.add(t.id);
          haptic.timerDone();
          // VoiceOver says it too, whatever screen is shown.
          AccessibilityInfo.announceForAccessibility(
            i18n.t('notifications.timerDone', { label: t.label }),
          );
        }
      }
      if (!this.timers.length && this.tick) {
        clearInterval(this.tick);
        this.tick = null;
      }
      this.emit();
    }, 1000);
  }

  private async update(timers: KitchenTimer[]) {
    this.timers = timers;
    this.persist();
    this.ensureTick();
    this.emit();
    await this.syncLiveActivity();
  }

  async start(p: {
    label: string;
    seconds: number;
    recipeId?: string | null;
    stepIndex?: number | null;
    reminders?: KitchenTimer['reminders'];
  }) {
    await ensureNotificationPermission();
    const t = createTimer(
      {
        id: uuidv7(),
        label: p.label,
        durationSeconds: p.seconds,
        recipeId: p.recipeId,
        stepIndex: p.stepIndex,
      },
      Date.now(),
    );
    if (p.reminders?.length) t.reminders = p.reminders;
    t.notificationId = await scheduleTimerNotification(t.id, t.label, t.endsAt!);
    await this.scheduleReminders(t);
    haptic.light();
    await this.update([...this.timers, t]);
    return t;
  }

  async pause(id: string) {
    const now = Date.now();
    const next = await Promise.all(
      this.timers.map(async (t) => {
        if (t.id !== id) return t;
        await cancelNotification(t.notificationId);
        await cancelTimerReminders(t.id);
        return { ...pauseTimer(t, now), notificationId: null };
      }),
    );
    await this.update(next);
  }

  async resume(id: string) {
    const now = Date.now();
    const next = await Promise.all(
      this.timers.map(async (t) => {
        if (t.id !== id) return t;
        const r = resumeTimer(t, now);
        await this.scheduleReminders(r);
        return { ...r, notificationId: await scheduleTimerNotification(r.id, r.label, r.endsAt!) };
      }),
    );
    await this.update(next);
  }

  async extend(id: string, seconds: number) {
    const now = Date.now();
    const next = await Promise.all(
      this.timers.map(async (t) => {
        if (t.id !== id) return t;
        await cancelNotification(t.notificationId);
        this.notified.delete(t.id);
        const r = addTime(timerState(t, now) === 'done' ? { ...t, endsAt: now } : t, seconds, now);
        await this.scheduleReminders(r);
        return {
          ...r,
          notificationId: r.endsAt
            ? await scheduleTimerNotification(r.id, r.label, r.endsAt)
            : null,
        };
      }),
    );
    await this.update(next);
  }

  async stop(id: string) {
    const t = this.timers.find((x) => x.id === id);
    if (t) await cancelNotification(t.notificationId);
    await cancelTimerReminders(id);
    this.notified.delete(id);
    await this.update(this.timers.filter((x) => x.id !== id));
  }

  remaining(t: KitchenTimer) {
    return remainingSeconds(t, Date.now());
  }

  private async syncLiveActivity() {
    if (Platform.OS !== 'ios') return;
    try {
      const LA = await import('expo-live-activity');
      const now = Date.now();
      const running = this.timers
        .filter((t) => timerState(t, now) === 'running')
        .sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0));
      const next = running[0];
      // Loaded here: the runtime and the widgets import this module.
      const [{ runtime }, { publishTimerWidget }] = await Promise.all([
        import('./runtime'),
        import('./widgets'),
      ]);
      void publishTimerWidget(next ?? null);
      if (!next) {
        if (this.liveActivityId)
          LA.stopActivity(this.liveActivityId, { title: '', progressBar: { progress: 1 } });
        this.liveActivityId = null;
        return;
      }
      // Dynamic Island and lock screen: the timer's name, and what the step says.
      const stepText =
        next.recipeId && next.stepIndex !== null
          ? runtime.session?.repos.recipe(next.recipeId)?.data.steps[next.stepIndex]?.text
          : null;
      const short = stepText
        ? stepText.length > 60
          ? `${stepText.slice(0, 59)}…`
          : stepText
        : null;
      const state = {
        title: next.label,
        subtitle:
          [short, running.length > 1 ? `+${running.length - 1}` : null]
            .filter(Boolean)
            .join('  ·  ') || undefined,
        progressBar: { date: next.endsAt! },
        imageName: 'glyph',
        dynamicIslandImageName: 'glyph',
      };
      if (this.liveActivityId) LA.updateActivity(this.liveActivityId, state);
      else
        this.liveActivityId =
          LA.startActivity(state, {
            backgroundColor: '#1F4D3A',
            titleColor: '#F7F1E6',
            subtitleColor: '#E8DFCF',
            progressViewTint: '#E8894F',
            timerType: 'circular',
            deepLinkUrl: next.recipeId ? `/recipe/${next.recipeId}/cook` : '/',
          }) ?? null;
    } catch {
      // Live Activities unavailable (older iOS, disabled by the user): notifications still fire.
    }
  }
}

export const timers = new TimerManager();
