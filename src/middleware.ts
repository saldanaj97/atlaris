import { getSessionCookie } from 'better-auth/cookies';
import { NextRequest, NextResponse } from 'next/server';

import { appEnv } from '@/lib/config/env';

const protectedPrefixes = ['/dashboard', '/api', '/plans', '/account'];

function isProtectedRoute(pathname: string): boolean {
  // Auth API routes must NOT be protected (they handle sign-in/sign-up)
  if (pathname.startsWith('/api/auth/')) {
    return false;
  }
  // Stripe webhooks bypass all checks
  if (pathname.startsWith('/api/v1/stripe/webhook')) {
    return false;
  }
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CORRELATION_ID_MAX_LENGTH = 64;

const sanitizeCorrelationId = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CORRELATION_ID_MAX_LENGTH) return null;
  if (!CORRELATION_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
};

const getCorrelationId = (request: NextRequest): string => {
  const headerCorrelationId = request.headers.get('x-correlation-id');
  const sanitized = sanitizeCorrelationId(headerCorrelationId);
  return sanitized ?? crypto.randomUUID();
};

const withCorrelationId = (
  request: NextRequest,
  response: NextResponse
): NextResponse => {
  const correlationId = getCorrelationId(request);
  response.headers.set('x-correlation-id', correlationId);
  return response;
};

const nextWithCorrelationId = (request: NextRequest): NextResponse => {
  const correlationId = getCorrelationId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
};

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Stripe webhooks bypass all checks including maintenance mode
  if (pathname.startsWith('/api/v1/stripe/webhook')) {
    return nextWithCorrelationId(request);
  }

  // Maintenance mode
  const isMaintenanceMode = appEnv.maintenanceMode;
  const isMaintenancePage = pathname === '/maintenance';

  if (isMaintenanceMode && !isMaintenancePage) {
    return withCorrelationId(
      request,
      NextResponse.redirect(new URL('/maintenance', request.url))
    );
  }
  if (!isMaintenanceMode && isMaintenancePage) {
    return withCorrelationId(
      request,
      NextResponse.redirect(new URL('/', request.url))
    );
  }

  // Auth protection
  if (isProtectedRoute(pathname)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return withCorrelationId(
        request,
        NextResponse.redirect(new URL('/auth/sign-in', request.url))
      );
    }
  }

  return nextWithCorrelationId(request);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
