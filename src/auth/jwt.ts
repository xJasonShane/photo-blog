/**
 * Minimal JWT session helpers replacing next-auth. Uses the same
 * environment contract (`AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
 * and an httpOnly session cookie. Edge-runtime safe (pure Web Crypto).
 */
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'authjs.session-token';
export const SESSION_MAX_AGE_IN_SECONDS = 60 * 60 * 24 * 30;

export type AuthSession = {
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
  expires?: string
};

const getSecretKey = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) { return undefined; }
  return new TextEncoder().encode(secret);
};

export const generateSessionToken = async (email: string) => {
  const key = getSecretKey();
  if (!key) {
    throw new Error('AUTH_SECRET must be configured to sign in');
  }
  const expires = new Date(
    Date.now() + SESSION_MAX_AGE_IN_SECONDS * 1000,
  );
  return {
    token: await new SignJWT({ email, name: 'Admin User' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(key),
    expires: expires.toISOString(),
  };
};

export const verifySessionToken = async (
  token?: string,
): Promise<AuthSession | null> => {
  const key = getSecretKey();
  if (!token || !key) { return null; }
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.email) { return null; }
    return {
      user: {
        email: payload.email as string,
        name: (payload.name as string | undefined) ?? 'Admin User',
      },
      expires: payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : undefined,
    };
  } catch {
    return null;
  }
};
