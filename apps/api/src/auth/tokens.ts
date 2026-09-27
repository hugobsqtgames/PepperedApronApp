import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '../env';
import { unauthorized } from '../lib/errors';

const ISSUER = 'pepperedapron';
const AUDIENCE = 'pepperedapron-app';

export async function signAccessToken(
  env: Env,
  p: { userId: string; sessionId: string; role: string },
): Promise<string> {
  return new SignJWT({ sid: p.sessionId, role: p.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(p.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(env.JWT_SECRET));
}

export async function verifyAccessToken(
  env: Env,
  token: string,
): Promise<{ userId: string; sessionId: string }> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
      throw new Error('claims');
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (e) {
    const expired = e instanceof Error && (e as { code?: string }).code === 'ERR_JWT_EXPIRED';
    throw unauthorized(expired ? 'token_expired' : 'invalid_token');
  }
}
