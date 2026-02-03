import {
  clerkMiddleware,
  createRouteMatcher,
  type ClerkMiddlewareAuth,
} from '@clerk/nextjs/server';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { appEnv } from '@/lib/config/env';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api(.*)',
  '/plans(.*)',
]);

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CORRELATION_ID_MAX_LENGTH = 64;

const sanitizeCorrelationId = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > CORRELATION_ID_MAX_LENGTH) {
    return null;
  }
  if (!CORRELATION_ID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const getCorrelationId = (request: NextRequest): string => {
  const headerCorrelationId = request.headers.get('x-correlation-id');
  const sanitized = sanitizeCorrelationId(headerCorrelationId);
  return sanitized ?? crypto.randomUUID();
};

const nextResponseWithCorrelationId = (request: NextRequest): NextResponse => {
  const correlationId = getCorrelationId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
};

export default clerkMiddleware(
  async (auth: ClerkMiddlewareAuth, request: NextRequest) => {
    // Allow Stripe webhooks to bypass all checks (including maintenance mode)
    if (request.nextUrl.pathname.startsWith('/api/v1/stripe/webhook')) {
      return nextResponseWithCorrelationId(request);
    }

    const isMaintenanceMode = appEnv.maintenanceMode;
    const isMaintenancePage = request.nextUrl.pathname === '/maintenance';

    if (isMaintenanceMode && !isMaintenancePage) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }

    if (!isMaintenanceMode && isMaintenancePage) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    if (isProtectedRoute(request)) await auth.protect();
    return nextResponseWithCorrelationId(request);
  },
  {
    // CSP configuration - see https://clerk.com/docs/security/clerk-csp
    contentSecurityPolicy: {
      directives: {
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
      },
    },
  }
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
