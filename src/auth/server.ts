import { cookies, headers } from 'next/headers';
import {
  AuthSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_IN_SECONDS,
  generateSessionToken,
  verifySessionToken,
} from './jwt';
import { KEY_CREDENTIALS_SIGN_IN_ERROR } from './index';
import { isPathProtected } from '@/app/path';
import { checkRateLimit } from '@/platforms/rate-limit';
import sleep from '@/utility/sleep';

export type { AuthSession as Session };

export const auth = async (): Promise<AuthSession | null> => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
};

/**
 * Constant-time credential comparison: both values are hashed first so
 * the comparison always runs over exactly 32 bytes, independent of
 * input lengths.
 */
const timingSafeStringEqual = async (a: string, b: string) => {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let difference = 0;
  for (let i = 0; i < bytesA.length; i++) {
    difference |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return difference === 0;
};

const FAILED_SIGN_IN_RATE_LIMIT = {
  tokens: 10,
  duration: '15m' as const,
};
const FAILED_SIGN_IN_DELAY_MS = 1000;

const getClientIpAddress = async () => {
  const headerStore = await headers();
  return headerStore.get('cf-connecting-ip') ??
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
};

/**
 * Throttles online credential guessing: failed attempts count against a
 * per IP + email limit (when Redis is configured) and are always
 * delayed. Limit breaches surface as a regular credentials error so the
 * throttle state is not leaked to the client.
 */
const throttleFailedSignInAttempt = async (email: string) => {
  let rateLimited = false;
  try {
    const { success } = await checkRateLimit({
      identifier: `sign-in-failed:${await getClientIpAddress()}:${email}`,
      ...FAILED_SIGN_IN_RATE_LIMIT,
    });
    rateLimited = !success;
  } catch (e) {
    // Redis unavailability must never lock the single admin out; the
    // delay below still applies to every failed attempt.
    console.error('Sign-in rate limit check failed:', e);
  }
  if (rateLimited) {
    console.error('Sign-in rate limit exceeded for failed attempts');
    throw new Error(KEY_CREDENTIALS_SIGN_IN_ERROR);
  }
  await sleep(FAILED_SIGN_IN_DELAY_MS);
};

/**
 * Replaces next-auth's `signIn('credentials', ...)`: validates the
 * supplied credentials against `ADMIN_EMAIL`/`ADMIN_PASSWORD` and stores
 * the signed session cookie. Throws a `CredentialsSignin` error on bad
 * credentials (mimicking next-auth's error surface).
 */
export const signIn = async (
  _provider: 'credentials',
  options: Record<string, unknown>,
) => {
  const email = typeof options.email === 'string' ? options.email : '';
  const password =
    typeof options.password === 'string' ? options.password : '';
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  const isValidCredentials = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD) &&
    (await timingSafeStringEqual(email, ADMIN_EMAIL ?? '')) &&
    (await timingSafeStringEqual(password, ADMIN_PASSWORD ?? ''));

  if (!isValidCredentials) {
    await throttleFailedSignInAttempt(email);
    throw new Error(KEY_CREDENTIALS_SIGN_IN_ERROR);
  }

  const { token, expires } = await generateSessionToken(email);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_IN_SECONDS,
    expires: new Date(expires),
  });
};

export const signOut = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
};

export const handlers = {
  GET: async () => {
    const session = await auth();
    return Response.json(session);
  },
  POST: async () => Response.json({ ok: true }),
};

export const runAuthenticatedAdminServerAction = async <T>(
  callback: () => T,
): Promise<T> => {
  const session = await auth();
  if (session?.user) {
    return callback();
  } else {
    throw new Error('Unauthorized server action request');
  }
};

// Used by proxy.ts (edge middleware) to protect routes
export const isRequestAuthorized = async (
  pathname: string,
  sessionToken?: string,
) => {
  if (!isPathProtected(pathname)) { return true; }
  const session = await verifySessionToken(sessionToken);
  return Boolean(session?.user);
};
