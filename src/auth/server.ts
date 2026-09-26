import { cookies } from 'next/headers';
import {
  AuthSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_IN_SECONDS,
  generateSessionToken,
  verifySessionToken,
} from './jwt';
import { isPathProtected } from '@/app/path';

export type { AuthSession as Session };

export const auth = async (): Promise<AuthSession | null> => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
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
  const email = options.email;
  const password = options.password;

  if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD ||
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    throw new Error('CredentialsSignin');
  }

  const { token, expires } = await generateSessionToken(email as string);

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
};export const runAuthenticatedAdminServerAction = async <T>(
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
