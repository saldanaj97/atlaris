import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';
import { getCorrelationId } from '@/lib/proxy/correlation';
import {
  isProviderWebhookRoute,
  isProtectedRoute,
  isSiteGateExempt,
  resolveSiteGateRedirectPath,
  resolveSiteGateRedirectSource,
  resolveViewerSiteGate,
  shouldBypassClerkMiddleware,
  shouldUseClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import {
  applyProxySecurityHeaders,
  createContentSecurityPolicy,
  createCspNonce,
} from '@/lib/proxy/security-headers';
import { resolveSiteGate } from '@/lib/proxy/site-gate';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';

type ProxyRequestContext = ReturnType<typeof buildProxyRequestContext>;

function buildProxyRequestContext(request: NextRequest) {
  const correlationId = getCorrelationId(request);
  const nonce = createCspNonce();
  const contentSecurityPolicy = createContentSecurityPolicy({
    isDevelopment: appEnv.isDevelopment,
    nonce,
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  return { correlationId, nonce, contentSecurityPolicy };
}

function nextWithProxyContext(
  request: NextRequest,
  options?: { skipCsp?: boolean; ctx?: ProxyRequestContext },
): NextResponse {
  const ctx = options?.ctx ?? buildProxyRequestContext(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', ctx.correlationId);

  if (!options?.skipCsp) {
    requestHeaders.set('x-nonce', ctx.nonce);
    requestHeaders.set('Content-Security-Policy', ctx.contentSecurityPolicy);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (options?.skipCsp) {
    response.headers.set('x-correlation-id', ctx.correlationId);
    return response;
  }

  response.headers.set('x-correlation-id', ctx.correlationId);
  return applyProxySecurityHeaders(response, ctx.contentSecurityPolicy, {
    isProduction: appEnv.isProduction,
  });
}

const withCorrelationId = (
  request: NextRequest,
  response: NextResponse,
): NextResponse => {
  const ctx = buildProxyRequestContext(request);
  response.headers.set('x-correlation-id', ctx.correlationId);
  return applyProxySecurityHeaders(response, ctx.contentSecurityPolicy, {
    isProduction: appEnv.isProduction,
  });
};

type ProtectRequest = () => Promise<NextResponse | undefined>;
type IsSignedIn = () => Promise<boolean>;

async function handleProxyRequest(
  request: NextRequest,
  protectRequest: ProtectRequest,
  isSignedIn: IsSignedIn,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Payment/auth provider webhooks bypass all checks including maintenance mode.
  if (isProviderWebhookRoute(pathname)) {
    return nextWithProxyContext(request);
  }

  // Maintenance mode / launch waitlist. Exempt paths never redirect, so skip the flag reads.
  if (!isSiteGateExempt(pathname)) {
    const flagGate = await resolveSiteGate();
    // Only the waitlist depends on the viewer, so other gates skip the session read.
    const siteGate =
      flagGate === 'waitlist'
        ? resolveViewerSiteGate(flagGate, await isSignedIn())
        : flagGate;
    const gateTarget = resolveSiteGateRedirectPath(siteGate, pathname, {
      allowGatePagePreview: appEnv.isDevelopment,
    });

    if (gateTarget !== null) {
      const redirectUrl = new URL(gateTarget, request.url);
      const source = resolveSiteGateRedirectSource(pathname);
      if (siteGate !== null && source !== null) {
        redirectUrl.searchParams.set('from', source);
      }
      return withCorrelationId(request, NextResponse.redirect(redirectUrl));
    }
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
      const ctx = buildProxyRequestContext(request);
      console.debug('[dev_auth_bypass]', {
        event: 'dev_auth_bypass',
        userId: devAuthEnv.userId,
        pathname,
        correlationId: ctx.correlationId,
      });
      return nextWithProxyContext(request, { ctx });
    }

    const protectionResponse = await protectRequest();
    if (protectionResponse) {
      return withCorrelationId(request, protectionResponse);
    }
  }

  return nextWithProxyContext(request);
}

const clerkProxy = clerkMiddleware(
  async (auth, request: NextRequest) =>
    handleProxyRequest(
      request,
      async () => {
        await auth.protect();
        return undefined;
      },
      // clerkMiddleware already authenticated the request, so this adds no network call.
      async () => (await auth()).userId !== null,
    ),
  {
    signInUrl: '/auth/sign-in',
    signUpUrl: '/auth/sign-up',
  },
);

function proxy(request: NextRequest, event: NextFetchEvent) {
  if (
    shouldUseClerkMiddleware({
      isDevelopment: appEnv.isDevelopment,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    })
  ) {
    return clerkProxy(request, event);
  }

  return handleProxyRequest(
    request,
    async () => {
      const signInUrl = new URL('/auth/sign-in', request.url);
      signInUrl.searchParams.set(
        'redirect_url',
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(signInUrl);
    },
    // No Clerk keys locally, so no session to admit.
    async () => false,
  );
}

export default proxy;

export const config = {
  matcher: [
    // Catch-all for app routes. Skip /ingest so
    // the public PostHog proxy stays outside Clerk; that route owns validation.
    '/((?!_next|ingest(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)',
    '/(api|trpc)(.*)',
  ],
};
