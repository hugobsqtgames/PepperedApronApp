import type { Env } from '../env';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<void>;
}

export class MemoryPush implements PushSender {
  readonly sent: PushMessage[] = [];
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
  }
}

export class NoopPush implements PushSender {
  async send() {}
}

/** Expo Push Service (APNs + FCM), free. */
export class ExpoPush implements PushSender {
  constructor(private readonly token?: string) {}
  async send(messages: PushMessage[]) {
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100).map((m) => ({ ...m, sound: 'default' }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error(`[push] Expo push failed with ${res.status}`);
    }
  }
}

export function createPush(env: Env): PushSender {
  if (env.PUSH_DRIVER === 'expo') return new ExpoPush(env.EXPO_ACCESS_TOKEN);
  if (env.PUSH_DRIVER === 'memory') return new MemoryPush();
  return new NoopPush();
}
