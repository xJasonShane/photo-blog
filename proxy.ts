import { isRequestAuthorized } from './src/auth/server';
import { SESSION_COOKIE_NAME } from './src/auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import {
  PATH_ADMIN,
  PATH_ADMIN_PHOTOS,
  PATH_OG,
  PATH_OG_SAMPLE,
  PATH_SIGN_IN,
  PREFIX_PHOTO,
  PREFIX_TAG,
} from './src/app/path';

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname === PATH_ADMIN) {
    return NextResponse.redirect(new URL(PATH_ADMIN_PHOTOS, req.url));
  } else if (pathname === PATH_OG) {
    return NextResponse.redirect(new URL(PATH_OG_SAMPLE, req.url));
  } else if (/^\/photos\/(.)+$/.test(pathname)) {
    // Accept /photos/* paths, but serve /p/*
    const matches = pathname.match(/^\/photos\/(.+)$/);
    return NextResponse.rewrite(new URL(
      `${PREFIX_PHOTO}/${matches?.[1]}`,
      req.url,
    ));
  } else if (/^\/t\/(.)+$/.test(pathname)) {
    // Accept /t/* paths, but serve /tag/*
    const matches = pathname.match(/^\/t\/(.+)$/);
    return NextResponse.rewrite(new URL(
      `${PREFIX_TAG}/${matches?.[1]}`,
      req.url,
    ));
  }

  const isAuthorized = await isRequestAuthorized(
    pathname,
    req.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!isAuthorized) {
    const signInUrl = new URL(PATH_SIGN_IN, req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Excludes:
  // - /api + /api/auth*
  // - /_next/static*
  // - /_next/image*
  // - /favicon.ico + /favicons/*
  // - /grid
  // - /full
  // - /library
  // - / (root)
  // - /home-image
  // - /template-image
  // - /template-image-tight
  // - /template-url
  // eslint-disable-next-line max-len
  matcher: ['/((?!api$|api/auth|_next/static|_next/image|favicon.ico$|favicons/|grid$|full$|library$|home-image$|template-image$|template-image-tight$|template-url$|$).*)'],
};
