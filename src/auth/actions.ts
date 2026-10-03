'use server';

import {
  auth,
  runAuthenticatedAdminServerAction,
  signIn,
  signOut,
} from '@/auth/server';
import type { Session } from '@/auth/server';
import { redirect } from 'next/navigation';
import {
  generateAuthSecret,
  isSafeInternalRedirectPath,
  KEY_CALLBACK_URL,
  KEY_CREDENTIALS_SIGN_IN_ERROR,
  KEY_CREDENTIALS_SUCCESS,
} from '.';
import { isCredentialsSignInError } from '.';

export const signInAction = async (
  _prevState: string | undefined,
  formData: FormData,
) => {
  try {
    await signIn('credentials', Object.fromEntries(formData));
  } catch (error) {
    if (isCredentialsSignInError(error)) {
      // Return credentials error to display on sign-in page.
      return KEY_CREDENTIALS_SIGN_IN_ERROR;
    } else {
      console.log('Unknown sign in error:', {
        errorText: `${error}`,
        error,
      });
      // Rethrow non-redirect errors
      throw error;
    }
  }
  const callbackUrl = formData.get(KEY_CALLBACK_URL);
  if (typeof callbackUrl === 'string' &&
    isSafeInternalRedirectPath(callbackUrl)) {
    redirect(callbackUrl);
  }
  return KEY_CREDENTIALS_SUCCESS;
};

export const signOutAction = async () =>
  signOut();

export const getAuthAction = async (): Promise<Session | null> => auth();

export const logClientAuthUpdate = async (data: Session | null | undefined) =>
  console.log('Client auth update', data);

export const generateAuthSecretAction = async () =>
  runAuthenticatedAdminServerAction(() => generateAuthSecret());
