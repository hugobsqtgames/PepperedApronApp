import type { Env } from '../env';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  /** Tokens the push service reports as uninstalled/expired: they must be forgotten. */
  invalidTokens: string[];
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult>;
}

export class MemoryPush implements PushSender {
  readonly sent: PushMessage[] = [];
  /** Tokens to report as invalid (tests). */
  readonly invalid = new Set<string>();
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return { invalidTokens: messages.map((m) => m.to).filter((t) => this.invalid.has(t)) };
  }
}

export class NoopPush implements PushSender {
  async send() {
    return { invalidTokens: [] };
  }
}

/** Expo Push Service (APNs + FCM), free. */
export class ExpoPush implements PushSender {
  constructor(private readonly token?: string) {}
  async send(messages: PushMessage[]) {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100).map((m) => ({ ...m, sound: 'default' }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.error(`[push] Expo push failed with ${res.status}`);
        continue;
      }
      // One ticket per message, in order.
      const body = (await res.json().catch(() => null)) as {
        data?: { status: string; details?: { error?: string } }[];
      } | null;
      body?.data?.forEach((ticket, j) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered')
          invalidTokens.push(chunk[j]!.to);
      });
    }
    return { invalidTokens };
  }
}

export function createPush(env: Env): PushSender {
  if (env.PUSH_DRIVER === 'expo') return new ExpoPush(env.EXPO_ACCESS_TOKEN);
  if (env.PUSH_DRIVER === 'memory') return new MemoryPush();
  return new NoopPush();
}
