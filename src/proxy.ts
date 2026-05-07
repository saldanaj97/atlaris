import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';
import {
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
} from '@/lib/proxy/middleware-policy';

// Next.js injects inline bootstrap scripts today, so keep unsafe-inline until
// we migrate this middleware to a nonce-based CSP. unsafe-eval is only needed
// for local dev tooling and must stay out of production.
const SCRIPT_SRC = appEnv.isDevelopment
  ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
  : ["'self'", "'unsafe-inline'"];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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

const withSecurityHeaders = (response: NextResponse): NextResponse => {
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  if (appEnv.isProduction) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  return response;
};

const withCorrelationId = (
  request: NextRequest,
  response: NextResponse,
): NextResponse => {
  const correlationId = getCorrelationId(request);
  response.headers.set('x-correlation-id', correlationId);
  return withSecurityHeaders(response);
};

const nextWithCorrelationId = (request: NextRequest): NextResponse => {
  const correlationId = getCorrelationId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);
  return withSecurityHeaders(response);
};

const proxy = clerkMiddleware(
  async (auth, request: NextRequest) => {
    const { pathname } = request.nextUrl;

    // Stripe webhooks bypass all checks including maintenance mode
    if (pathname.startsWith('/api/v1/stripe/webhook')) {
      return nextWithCorrelationId(request);
    }

    // Maintenance mode
    const maintenanceTarget = resolveMaintenanceRedirectPath(
      appEnv.maintenanceMode,
      pathname,
    );

    if (maintenanceTarget !== null) {
      return withCorrelationId(
        request,
        NextResponse.redirect(new URL(maintenanceTarget, request.url)),
      );
    }

    // Auth protection
    if (isProtectedRoute(pathname)) {
      // In development, when DEV_AUTH_USER_ID is set, bypass middleware auth for
      // API routes. Clerk does not use this override and would redirect even when
      // the route handler would accept the dev user. Route handlers still run
      // withAuth and use getEffectiveAuthUserId.
      // When LOCAL_PRODUCT_TESTING is enabled, also bypass protected pages so
      // shell and server components match the seeded local identity.
      if (
        shouldBypassClerkMiddleware({
          isDevelopment: appEnv.isDevelopment,
          devAuthUserId: devAuthEnv.userId,
          localProductTestingEnabled: localProductTestingEnv.enabled,
          pathname,
        })
      ) {
        console.debug('[dev_auth_bypass]', {
          event: 'dev_auth_bypass',
          userId: devAuthEnv.userId,
          pathname,
          correlationId: getCorrelationId(request),
        });
        return nextWithCorrelationId(request);
      }

      await auth.protect();
    }

    return nextWithCorrelationId(request);
  },
  {
    signInUrl: '/auth/sign-in',
    signUpUrl: '/auth/sign-up',
  },
);

export default proxy;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
