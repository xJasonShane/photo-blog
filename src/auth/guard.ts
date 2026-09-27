import { auth } from '@/auth/server';
import { redirect } from 'next/navigation';
import { PATH_SIGN_IN } from '@/app/path';

/**
 * Server-side page guard replacing the former proxy.ts (middleware)
 * protection — works identically on Cloudflare Workers and EdgeOne
 * Pages, neither of which reliably supports the Next.js Node.js
 * middleware runtime.
 */
export const redirectIfUnauthenticated = async (
  callbackPath?: string,
) => {
  const session = await auth();
  if (!session?.user) {
    redirect(
      callbackPath
        ? `${PATH_SIGN_IN}?callbackUrl=${encodeURIComponent(callbackPath)}`
        : PATH_SIGN_IN,
    );
  }
  return session;
};
