import { deleteCookie, getCookie, storeCookie } from '@/utility/cookie';

export const KEY_CREDENTIALS_SIGN_IN_ERROR = 'CredentialsSignin';
export const KEY_CREDENTIALS_SIGN_IN_ERROR_URL =
  'https://errors.authjs.dev#credentialssignin';
export const KEY_CREDENTIALS_CALLBACK_ROUTE_ERROR_URL =
  'https://errors.authjs.dev#callbackrouteerror';
export const KEY_CREDENTIALS_SUCCESS = 'success';
export const KEY_CALLBACK_URL = 'callbackUrl';

const KEY_AUTH_EMAIL = 'authjs.email';

export const storeAuthEmailCookie = (email: string) =>
  storeCookie(KEY_AUTH_EMAIL, email);

export const getAuthEmailCookie = () =>
  getCookie(KEY_AUTH_EMAIL);

export const hasAuthEmailCookie = () =>
  Boolean(getCookie(KEY_AUTH_EMAIL));

export const clearAuthEmailCookie = () =>
  deleteCookie(KEY_AUTH_EMAIL);

export const isCredentialsSignInError = (error?: any) =>
  (error?.message || `${error}`).includes(KEY_CREDENTIALS_SIGN_IN_ERROR);

/**
 * Only same-origin relative paths may be used as post-sign-in redirect
 * targets: rejects absolute URLs and protocol-relative forms such as
 * `//evil.com` or `/\evil.com` (browsers normalize backslashes to
 * slashes in the authority position).
 */
export const isSafeInternalRedirectPath = (path: string) =>
  path.startsWith('/') &&
  !path.startsWith('//') &&
  !path.startsWith('/\\');

// Generated locally from `crypto` instead of fetching a third-party
// service (generate-secret.vercel.app): an unreachable external service
// must never break admin pages, and a local CSPRNG is not a supply-chain
// dependency. 48 base64url chars ≈ 288 bits of entropy.
export const generateAuthSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(36));
  const base64 = btoa(String.fromCharCode(...bytes));
  return Promise.resolve(
    base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''),
  );
};
