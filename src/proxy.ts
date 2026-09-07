import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_PREFIXES = [
  '/notes',
  '/track',
  '/money',
  '/search',
  '/settings',
  '/auth/setup',
];

// Routes that authenticated users should not visit
const AUTH_ONLY_ROUTES = ['/auth'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, API routes, Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // files like favicon.ico, etc.
  ) {
    return NextResponse.next();
  }

  // Detect session: Supabase stores auth in cookies named sb-{ref}-auth-token
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  // Check both the main cookie and chunk cookies (sb-xxx-auth-token.0, .1, etc.)
  const cookies = request.cookies;
  const hasSession =
    !!cookies.get(cookieName) ||
    !!cookies.get(`${cookieName}.0`) ||
    // Also check for older Supabase cookie format
    [...cookies.getAll()].some(c => c.name.includes('auth-token') && c.name.includes(projectRef));

  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  const isAuthRoute = AUTH_ONLY_ROUTES.some(p => pathname.startsWith(p));

  // Unauthenticated user trying to access protected route
  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    return NextResponse.redirect(url);
  }

  // Authenticated user trying to visit /auth (already signed in)
  if (isAuthRoute && hasSession && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/auth/setup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
