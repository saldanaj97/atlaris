import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { maintenanceMode } from '@/flags';
import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';
import { getCorrelationId } from '@/lib/proxy/correlation';
import { resolveEffectiveMaintenanceMode } from '@/lib/proxy/maintenance-mode';
import {
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import {
  applyProxySecurityHeaders,
  createContentSecurityPolicy,
  createCspNonce,
} from '@/lib/proxy/security-headers';

const createRequestContentSecurityPolicy = (nonce: string): string =>
  createContentSecurityPolicy({
    isDevelopment: appEnv.isDevelopment,
    nonce,
  });

const withCorrelationId = (
  request: NextRequest,
  response: NextResponse,
): NextResponse => {
  const correlationId = getCorrelationId(request);
  const nonce = createCspNonce();
  response.headers.set('x-correlation-id', correlationId);
  return applyProxySecurityHeaders(
    response,
    createRequestContentSecurityPolicy(nonce),
    { isProduction: appEnv.isProduction },
  );
};

const nextWithCorrelationId = (request: NextRequest): NextResponse => {
  const correlationId = getCorrelationId(request);
  const nonce = createCspNonce();
  const contentSecurityPolicy = createRequestContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-correlation-id', correlationId);
  return applyProxySecurityHeaders(response, contentSecurityPolicy, {
    isProduction: appEnv.isProduction,
  });
};

const proxy = clerkMiddleware(
  async (auth, request: NextRequest) => {
    const { pathname } = request.nextUrl;

    // Stripe webhooks bypass all checks including maintenance mode
    if (pathname.startsWith('/api/v1/stripe/webhook')) {
      return nextWithCorrelationId(request);
    }

    // Maintenance mode
    const effectiveMaintenanceMode = await resolveEffectiveMaintenanceMode(
      appEnv.maintenanceMode,
      { resolveMaintenanceFlag: maintenanceMode },
    );
    const maintenanceTarget = resolveMaintenanceRedirectPath(
      effectiveMaintenanceMode,
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
