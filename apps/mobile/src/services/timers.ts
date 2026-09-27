import { AppState, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { addTime, createTimer, pauseTimer, remainingSeconds, resumeTimer, timerState, uuidv7, type KitchenTimer } from '@pepperedapron/core';
import { cancelNotification, ensureNotificationPermission, scheduleTimerNotification } from './notifications';
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
  private tick: ReturnType<typeof setInterval> | null = null;
  private notified = new Set<string>();
  private liveActivityId: string | null = null;

  constructor() {
    try {
      const f = file();
      if (f.exists) this.timers = JSON.parse(f.textSync()) as KitchenTimer[];
    } catch {
      this.timers = [];
    }
    this.ensureTick();
    AppState.addEventListener('change', (s) => s === 'active' && this.emit());
  }

  list() {
    return this.timers;
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
        if (timerState(t, now) === 'done' && !this.notified.has(t.id)) {
          this.notified.add(t.id);
          haptic.success();
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

  async start(p: { label: string; seconds: number; recipeId?: string | null; stepIndex?: number | null }) {
    await ensureNotificationPermission();
    const t = createTimer({ id: uuidv7(), label: p.label, durationSeconds: p.seconds, recipeId: p.recipeId, stepIndex: p.stepIndex }, Date.now());
    t.notificationId = await scheduleTimerNotification(t.id, t.label, t.endsAt!);
    haptic.light();
    await this.update([...this.timers, t]);
    return t;
  }

  async pause(id: string) {
    const now = Date.now();
    const next = await Promise.all(this.timers.map(async (t) => {
      if (t.id !== id) return t;
      await cancelNotification(t.notificationId);
      return { ...pauseTimer(t, now), notificationId: null };
    }));
    await this.update(next);
  }

  async resume(id: string) {
    const now = Date.now();
    const next = await Promise.all(this.timers.map(async (t) => {
      if (t.id !== id) return t;
      const r = resumeTimer(t, now);
      return { ...r, notificationId: await scheduleTimerNotification(r.id, r.label, r.endsAt!) };
    }));
    await this.update(next);
  }

  async extend(id: string, seconds: number) {
    const now = Date.now();
    const next = await Promise.all(this.timers.map(async (t) => {
      if (t.id !== id) return t;
      await cancelNotification(t.notificationId);
      this.notified.delete(t.id);
      const r = addTime(timerState(t, now) === 'done' ? { ...t, endsAt: now } : t, seconds, now);
      return { ...r, notificationId: r.endsAt ? await scheduleTimerNotification(r.id, r.label, r.endsAt) : null };
    }));
    await this.update(next);
  }

  async stop(id: string) {
    const t = this.timers.find((x) => x.id === id);
    if (t) await cancelNotification(t.notificationId);
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
      const running = this.timers.filter((t) => timerState(t, now) === 'running').sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0));
      const next = running[0];
      if (!next) {
        if (this.liveActivityId) LA.stopActivity(this.liveActivityId, { title: '', progressBar: { progress: 1 } });
        this.liveActivityId = null;
        return;
      }
      const state = { title: next.label, subtitle: running.length > 1 ? `+${running.length - 1}` : undefined, progressBar: { date: next.endsAt! }, imageName: 'glyph', dynamicIslandImageName: 'glyph' };
      if (this.liveActivityId) LA.updateActivity(this.liveActivityId, state);
      else this.liveActivityId = LA.startActivity(state, { backgroundColor: '#1F4D3A', titleColor: '#F7F1E6', subtitleColor: '#E8DFCF', progressViewTint: '#E8894F', timerType: 'circular', deepLinkUrl: next.recipeId ? `/recipe/${next.recipeId}/cook` : '/' }) ?? null;
    } catch {
      // Live Activities unavailable (older iOS, disabled by the user): notifications still fire.
    }
  }
}

export const timers = new TimerManager();
