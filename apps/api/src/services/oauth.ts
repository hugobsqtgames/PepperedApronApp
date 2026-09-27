import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { createHash } from 'node:crypto';
import { list, type Env } from '../env';
import { unauthorized } from '../lib/errors';

export type OAuthProvider = 'apple' | 'google' | 'facebook';

export interface OAuthProfile {
  provider: OAuthProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OAuthInput {
  idToken?: string;
  accessToken?: string;
  /** Raw nonce; the token must contain its SHA-256 (Apple, Facebook Limited Login). */
  nonce?: string;
  name?: string;
}

export interface OAuthVerifier {
  verify(provider: OAuthProvider, input: OAuthInput): Promise<OAuthProfile>;
}

export interface JwksSources {
  apple: JWTVerifyGetKey;
  google: JWTVerifyGetKey;
  facebook: JWTVerifyGetKey;
}

export function remoteJwks(): JwksSources {
  return {
    apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
    google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
    facebook: createRemoteJWKSet(
      new URL('https://limited.facebook.com/.well-known/oauth/openid/jwks/'),
    ),
  };
}

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');

export class DefaultOAuthVerifier implements OAuthVerifier {
  constructor(
    private readonly env: Env,
    private readonly jwks: JwksSources = remoteJwks(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(provider: OAuthProvider, input: OAuthInput): Promise<OAuthProfile> {
    try {
      if (provider === 'apple') return await this.apple(input);
      if (provider === 'google') return await this.google(input);
      return await this.facebook(input);
    } catch (e) {
      if (e instanceof Error && 'status' in e) throw e;
      throw unauthorized('oauth_invalid_token');
    }
  }

  private checkNonce(payload: Record<string, unknown>, nonce: string | undefined) {
    if (payload.nonce === undefined && nonce === undefined) return;
    if (!nonce || (payload.nonce !== sha256hex(nonce) && payload.nonce !== nonce))
      throw unauthorized('oauth_invalid_nonce');
  }

  private async apple(input: OAuthInput): Promise<OAuthProfile> {
    if (!input.idToken) throw unauthorized('oauth_invalid_token');
    const { payload } = await jwtVerify(input.idToken, this.jwks.apple, {
      issuer: 'https://appleid.apple.com',
      audience: list(this.env.APPLE_AUDIENCES),
    });
    this.checkNonce(payload, input.nonce);
    const email = typeof payload.email === 'string' ? payload.email : null;
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    return {
      provider: 'apple',
      subject: String(payload.sub),
      email,
      emailVerified: verified,
      name: input.name?.trim() || null,
    };
  }

  private async google(input: OAuthInput): Promise<OAuthProfile> {
    if (!input.idToken) throw unauthorized('oauth_invalid_token');
    const { payload } = await jwtVerify(input.idToken, this.jwks.google, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: list(this.env.GOOGLE_CLIENT_IDS),
    });
    this.checkNonce(payload, input.nonce);
    return {
      provider: 'google',
      subject: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  }

  private async facebook(input: OAuthInput): Promise<OAuthProfile> {
    if (input.idToken) {
      // iOS "Limited Login" returns an OIDC token.
      const { payload } = await jwtVerify(input.idToken, this.jwks.facebook, {
        issuer: ['https://www.facebook.com', 'https://limited.facebook.com'],
        audience: this.env.FACEBOOK_APP_ID,
      });
      this.checkNonce(payload, input.nonce);
      return {
        provider: 'facebook',
        subject: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : null,
        emailVerified: false,
        name: typeof payload.name === 'string' ? payload.name : null,
      };
    }
    if (!input.accessToken) throw unauthorized('oauth_invalid_token');
    const appToken = `${this.env.FACEBOOK_APP_ID}|${this.env.FACEBOOK_APP_SECRET}`;
    const dbg = await this.fetchImpl(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(input.accessToken)}&access_token=${encodeURIComponent(appToken)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const d = (await dbg.json()) as {
      data?: { is_valid?: boolean; app_id?: string; user_id?: string };
    };
    if (!d.data?.is_valid || d.data.app_id !== this.env.FACEBOOK_APP_ID || !d.data.user_id)
      throw unauthorized('oauth_invalid_token');
    const me = await this.fetchImpl(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(input.accessToken)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const p = (await me.json()) as { id?: string; name?: string; email?: string };
    if (p.id !== d.data.user_id) throw unauthorized('oauth_invalid_token');
    // Facebook e-mails are never trusted for account linking.
    return {
      provider: 'facebook',
      subject: p.id,
      email: p.email ?? null,
      emailVerified: false,
      name: p.name ?? null,
    };
  }
}
