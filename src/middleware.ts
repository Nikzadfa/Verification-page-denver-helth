import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readEdgeSession } from '@/lib/auth/edge';

/**
 * Cheap edge-side gate.
 *
 * Every page already revalidates the session against the database, so this is
 * purely a fast path: it turns a logged-out request for a protected page into
 * an immediate redirect instead of a database round trip and a full React
 * render that ends in the same redirect.
 *
 * It can only reject. Anything it lets through is still authenticated properly
 * downstream, which is what keeps session revocation immediate.
 */

/** Sign-in pages: open to strangers, pointless once you are signed in. */
const AUTH_PATHS = ['/login', '/register'];

/**
 * Open to everyone, signed in or not.
 *
 * The privacy policy and support pages have to be reachable without an
 * account: App Store Connect requires public URLs for both, and a reviewer
 * opens them before they ever create a login.
 */
const OPEN_PATHS = ['/legal'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const startsWith = (p: string) => pathname === p || pathname.startsWith(`${p}/`);

  const claims = await readEdgeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPage = AUTH_PATHS.some(startsWith);
  const isOpen = isAuthPage || OPEN_PATHS.some(startsWith);

  if (!claims && !isOpen) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Come back to where they were trying to go once they sign in.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users have no reason to see the sign-in page.
  if (claims && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // API routes do their own authentication and must return JSON errors rather
  // than redirects, so they are deliberately excluded.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
