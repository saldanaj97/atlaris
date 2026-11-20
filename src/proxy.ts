import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';
import { getCorrelationId } from '@/lib/proxy/correlation';
import {
  isProviderWebhookRoute,
  isProtectedRoute,
  isSiteGateExempt,
  resolveAnonymousAuthPath,
  resolveSiteGateRedirectPath,
  resolveSiteGateRedirectSource,
  resolveViewerSiteGate,
  shouldBypassClerkMiddleware,
  shouldUseClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import { normalizeProxyPathname } from '@/lib/proxy/normalize-pathname';
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

/**
 * Auth page for a signed-out request, returning the visitor to it afterwards.
 * `pathname` is the decoded policy path; `redirect_url` keeps the raw one,
 * which the proxy decodes again when the visitor comes back.
 */
function anonymousAuthUrl(request: NextRequest, pathname: string): URL {
  const url = new URL(resolveAnonymousAuthPath(pathname), request.url);
  url.searchParams.set(
    'redirect_url',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return url;
}

type ProtectRequest = (pathname: string) => Promise<NextResponse | undefined>;
type IsSignedIn = () => Promise<boolean>;

async function handleProxyRequest(
  request: NextRequest,
  protectRequest: ProtectRequest,
  isSignedIn: IsSignedIn,
): Promise<NextResponse> {
  const pathname = normalizeProxyPathname(request.nextUrl.pathname);
  if (pathname === null) {
    return withCorrelationId(request, new NextResponse(null, { status: 400 }));
  }

  if (isProviderWebhookRoute(pathname)) {
    return nextWithProxyContext(request);
  }

  if (!isSiteGateExempt(pathname)) {
    const flagGate = await resolveSiteGate();
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

  if (isProtectedRoute(pathname)) {
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

    const protectionResponse = await protectRequest(pathname);
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
      async (pathname) => {
        const authUrl = anonymousAuthUrl(request, pathname);
        await auth.protect(
          authUrl.pathname === '/auth/sign-up'
            ? { unauthenticatedUrl: authUrl.toString() }
            : undefined,
        );
        return undefined;
      },
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
    async (pathname) =>
      NextResponse.redirect(anonymousAuthUrl(request, pathname)),
    async () => false,
  );
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next|ingest(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)',
    '/(api|trpc)(.*)',
    '/(dashboard|plans|account|settings|analytics)(.*)',
    '/(.*%.*)',
  ],
};
