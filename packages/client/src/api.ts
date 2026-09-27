import type {
  PullResponse,
  PushResponse,
  RecipeDraft,
  SyncOp,
  SyncRecord,
} from '@pepperedapron/core';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}
/** The request never reached the server (offline, DNS, timeout). Always retryable. */
export class NetworkError extends Error {
  constructor(message = 'network') {
    super(message);
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(t: Tokens): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryTokenStore implements TokenStore {
  private t: Tokens | null = null;
  async get() {
    return this.t;
  }
  async set(t: Tokens) {
    this.t = t;
  }
  async clear() {
    this.t = null;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Called when the session can no longer be refreshed (revoked, account deleted). */
  onSessionExpired?: () => void;
}

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarKey: string | null;
  role: 'user' | 'admin';
  locale: string;
  hasPassword: boolean;
  providers: string[];
  createdAt: string;
}

export interface AuthResponse extends Tokens {
  expiresIn: number;
  user: PublicUser;
  isNewUser?: boolean;
}

export interface DeviceInfo {
  deviceName?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}

export interface ImportResult {
  draft: RecipeDraft;
  platform: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'pinterest' | 'web';
  completeness: 'full' | 'partial' | 'minimal';
}

export interface PublicRecipeCard {
  id: string;
  title: string;
  photoUrl: string | null;
  totalMinutes: number | null;
  category: string | null;
  difficulty: string | null;
  authorName: string;
  saveCount: number;
  publishedAt: string | null;
}

export interface HouseholdView {
  id: string;
  name: string;
  myRole: 'owner' | 'member';
  members: { userId: string; displayName: string; role: 'owner' | 'member'; joinedAt: string }[];
}

export interface RemoteConfig {
  mediaBaseUrl: string;
  webBaseUrl: string;
  minAppVersion: string;
  ads: {
    enabled: boolean;
    homeNativeAfterSection?: number;
    searchNativeEvery?: number;
    interstitialMinMinutes?: number;
  };
  legal: { privacy: string; terms: string; notice: string };
  stores: { ios: string; android: string };
}

/** Typed REST client with transparent, single-flight access-token refresh. */
export class ApiClient {
  private refreshing: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly o: ApiClientOptions) {
    this.fetchImpl = o.fetchImpl ?? ((...a) => fetch(...a));
  }

  get baseUrl() {
    return this.o.baseUrl.replace(/\/+$/, '');
  }

  private async raw(
    method: string,
    path: string,
    body: unknown,
    token: string | null,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.o.timeoutMs ?? 20_000);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...this.o.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      if (res.ok) return undefined as T;
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; details?: unknown } } | null)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? (res.status >= 500 ? 'server_unavailable' : 'bad_request'),
        err?.details,
      );
    }
    return json as T;
  }

  async refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const t = await this.o.tokens.get();
      if (!t) return false;
      try {
        const res = await this.raw(
          'POST',
          '/v1/auth/refresh',
          { refreshToken: t.refreshToken },
          null,
        );
        if (res.status === 401) {
          await this.o.tokens.clear();
          this.o.onSessionExpired?.();
          return false;
        }
        const r = await this.parse<AuthResponse>(res);
        await this.o.tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
        return true;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Authenticated request; refreshes the access token once on 401. */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean } = {},
  ): Promise<T> {
    const auth = opts.auth ?? true;
    const token = auth ? ((await this.o.tokens.get())?.accessToken ?? null) : null;
    let res = await this.raw(method, path, body, token);
    if (auth && res.status === 401) {
      if (await this.refresh()) {
        res = await this.raw(method, path, body, (await this.o.tokens.get())?.accessToken ?? null);
      } else {
        throw new ApiError(401, 'session_expired');
      }
    }
    return this.parse<T>(res);
  }

  // ---------------------------------------------------------------- auth
  private async storeAuth(r: AuthResponse) {
    await this.o.tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    return r;
  }
  register(p: {
    email: string;
    password: string;
    displayName: string;
    locale: string;
    device?: DeviceInfo;
  }) {
    return this.request<AuthResponse>('POST', '/v1/auth/register', p, { auth: false }).then((r) =>
      this.storeAuth(r),
    );
  }
  login(p: { email: string; password: string; device?: DeviceInfo }) {
    return this.request<AuthResponse>('POST', '/v1/auth/login', p, { auth: false }).then((r) =>
      this.storeAuth(r),
    );
  }
  oauth(
    provider: 'apple' | 'google' | 'facebook',
    p: {
      idToken?: string;
      accessToken?: string;
      nonce?: string;
      name?: string;
      locale?: string;
      device?: DeviceInfo;
    },
  ) {
    return this.request<AuthResponse>('POST', `/v1/auth/oauth/${provider}`, p, {
      auth: false,
    }).then((r) => this.storeAuth(r));
  }
  async logout() {
    try {
      await this.request('POST', '/v1/auth/logout');
    } finally {
      await this.o.tokens.clear();
    }
  }
  forgotPassword(email: string) {
    return this.request<{ ok: true }>(
      'POST',
      '/v1/auth/password/forgot',
      { email },
      { auth: false },
    );
  }
  resetPassword(token: string, password: string) {
    return this.request<{ ok: true }>(
      'POST',
      '/v1/auth/password/reset',
      { token, password },
      { auth: false },
    );
  }
  verifyEmail(token: string) {
    return this.request<{ ok: true }>('POST', '/v1/auth/email/verify', { token }, { auth: false });
  }
  resendVerification() {
    return this.request<{ ok: true }>('POST', '/v1/auth/email/resend');
  }

  // ---------------------------------------------------------------- account
  me() {
    return this.request<PublicUser>('GET', '/v1/me');
  }
  updateMe(p: { displayName?: string; avatarKey?: string | null; locale?: string }) {
    return this.request<PublicUser>('PATCH', '/v1/me', p);
  }
  changePassword(currentPassword: string | null, newPassword: string) {
    return this.request('POST', '/v1/me/password', { currentPassword, newPassword });
  }
  changeEmail(newEmail: string, password: string | null) {
    return this.request('POST', '/v1/me/email', { newEmail, password });
  }
  sessions() {
    return this.request<
      {
        id: string;
        deviceName: string | null;
        platform: string | null;
        appVersion: string | null;
        createdAt: string;
        lastUsedAt: string;
        current: boolean;
      }[]
    >('GET', '/v1/me/sessions');
  }
  revokeSession(id: string) {
    return this.request('DELETE', `/v1/me/sessions/${id}`);
  }
  revokeOtherSessions() {
    return this.request('POST', '/v1/me/sessions/revoke-others');
  }
  exportData() {
    return this.request<Record<string, unknown>>('GET', '/v1/me/export');
  }
  async deleteAccount(password: string | null) {
    await this.request('DELETE', '/v1/me', { password, confirm: 'DELETE' });
    await this.o.tokens.clear();
  }
  setPushToken(token: string, platform: 'ios' | 'android') {
    return this.request('PUT', '/v1/me/push-token', { token, platform });
  }

  // ---------------------------------------------------------------- sync
  push(ops: SyncOp[]) {
    return this.request<PushResponse>('POST', '/v1/sync/push', { ops });
  }
  pull(cursor: number, limit = 500) {
    return this.request<PullResponse>('GET', `/v1/sync/pull?cursor=${cursor}&limit=${limit}`);
  }

  // ---------------------------------------------------------------- media
  createUpload(contentType: string, size: number) {
    return this.request<{
      uploadId: string;
      key: string;
      url: string;
      method: 'PUT';
      headers: Record<string, string>;
      expiresAt: string;
    }>('POST', '/v1/uploads', { contentType, size });
  }
  completeUpload(uploadId: string) {
    return this.request<{ key: string; url: string }>('POST', `/v1/uploads/${uploadId}/complete`);
  }

  // ---------------------------------------------------------------- features
  config() {
    return this.request<RemoteConfig>('GET', '/v1/config', undefined, { auth: false });
  }
  importUrl(url: string) {
    return this.request<ImportResult>('POST', '/v1/import/url', { url });
  }
  household() {
    return this.request<{ household: HouseholdView | null }>('GET', '/v1/household');
  }
  createHousehold(name: string) {
    return this.request<{ household: HouseholdView }>('POST', '/v1/household', { name });
  }
  renameHousehold(name: string) {
    return this.request<{ household: HouseholdView }>('PATCH', '/v1/household', { name });
  }
  inviteToHousehold() {
    return this.request<{ code: string; expiresAt: string; url: string }>(
      'POST',
      '/v1/household/invites',
    );
  }
  joinHousehold(code: string) {
    return this.request<{ household: HouseholdView }>('POST', '/v1/household/join', { code });
  }
  leaveHousehold() {
    return this.request<{ household: null }>('POST', '/v1/household/leave');
  }
  removeHouseholdMember(userId: string) {
    return this.request<{ household: HouseholdView }>('DELETE', `/v1/household/members/${userId}`);
  }
  dissolveHousehold() {
    return this.request<{ household: null }>('DELETE', '/v1/household');
  }
  publicRecipes(
    p: {
      sort?: 'recent' | 'popular';
      category?: string;
      q?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const qs = new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    return this.request<{ items: PublicRecipeCard[] }>(
      'GET',
      `/v1/public/recipes?${qs}`,
      undefined,
      { auth: false },
    );
  }
  publicRecipe(id: string) {
    return this.request<Record<string, unknown>>('GET', `/v1/public/recipes/${id}`, undefined, {
      auth: false,
    });
  }
  savePublicRecipe(id: string) {
    return this.request<{ record: SyncRecord }>('POST', `/v1/public/recipes/${id}/save`);
  }
  reportRecipe(id: string, reason: string, details?: string) {
    return this.request('POST', `/v1/public/recipes/${id}/report`, {
      reason,
      details: details ?? null,
    });
  }
  shareRecipe(id: string) {
    return this.request<{ token: string; url: string }>('POST', `/v1/recipes/${id}/share`);
  }
  revokeShare(id: string) {
    return this.request('DELETE', `/v1/recipes/${id}/share`);
  }
  sharedRecipe(token: string) {
    return this.request<Record<string, unknown> & { isMine: boolean }>('GET', `/v1/share/${token}`);
  }
  saveSharedRecipe(token: string) {
    return this.request<{ record: SyncRecord }>('POST', `/v1/share/${token}/save`);
  }
  contact(p: { email: string | null; subject: string; message: string }) {
    return this.request('POST', '/v1/contact', p);
  }
  trackEvents(
    events: { name: string; at: string; props?: Record<string, string | number | boolean> }[],
  ) {
    return this.request<{ stored: number }>('POST', '/v1/analytics/events', { events });
  }

  // ---------------------------------------------------------------- admin
  admin = {
    stats: () => this.request<Record<string, unknown>>('GET', '/v1/admin/stats'),
    reports: (status?: string) =>
      this.request<{ items: Record<string, unknown>[] }>(
        'GET',
        `/v1/admin/reports${status ? `?status=${status}` : ''}`,
      ),
    handleReport: (id: string, p: { status: string; action: string; resolution?: string | null }) =>
      this.request('PATCH', `/v1/admin/reports/${id}`, p),
    recipe: (id: string) => this.request<Record<string, unknown>>('GET', `/v1/admin/recipes/${id}`),
    user: (id: string) => this.request<Record<string, unknown>>('GET', `/v1/admin/users/${id}`),
    setCanPublish: (id: string, canPublish: boolean) =>
      this.request('PATCH', `/v1/admin/users/${id}`, { canPublish }),
    messages: (status?: string) =>
      this.request<{ items: Record<string, unknown>[] }>(
        'GET',
        `/v1/admin/messages${status ? `?status=${status}` : ''}`,
      ),
    setMessageStatus: (id: string, status: string) =>
      this.request('PATCH', `/v1/admin/messages/${id}`, { status }),
  };
}
