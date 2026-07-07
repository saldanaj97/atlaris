import { maintenanceMode } from '@/flags';
import {
  appEnv,
  devAuthEnv,
  isHostedDeployEnv,
  localProductTestingEnv,
  readWorkflowCallbackTokenConfig,
} from '@/lib/config/env';
import { getCorrelationId } from '@/lib/proxy/correlation';
import { resolveEffectiveMaintenanceMode } from '@/lib/proxy/maintenance-mode';
import {
  isProviderWebhookRoute,
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import {
  applyProxySecurityHeaders,
  createContentSecurityPolicy,
  createCspNonce,
} from '@/lib/proxy/security-headers';
import {
  isWorkflowCallbackPath,
  resolveWorkflowCallbackAccess,
} from '@/lib/proxy/workflow-callback-auth';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

type ProxyRequestContext = ReturnType<typeof buildProxyRequestContext>;

function buildProxyRequestContext(request: NextRequest) {
  const correlationId = getCorrelationId(request);
  const nonce = createCspNonce();
  const contentSecurityPolicy = createContentSecurityPolicy({
    isDevelopment: appEnv.isDevelopment,
    nonce,
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

const proxy = clerkMiddleware(
  async (auth, request: NextRequest) => {
    const { pathname } = request.nextUrl;

    if (isWorkflowCallbackPath(pathname)) {
      const tokenConfig = readWorkflowCallbackTokenConfig();
      if (tokenConfig.status === 'invalid') {
        return new NextResponse(null, { status: 503 });
      }

      const callbackAccess = await resolveWorkflowCallbackAccess(
        {
          method: request.method,
          pathname,
          searchParams: request.nextUrl.searchParams,
          headers: request.headers,
        },
        {
          isProduction: appEnv.isProduction,
          isHostedVercelDeploy: isHostedDeployEnv(process.env),
          callbackToken: tokenConfig.token,
        },
      );

      if (callbackAccess.status === 'allow') {
        return nextWithProxyContext(request, { skipCsp: true });
      }

      if (callbackAccess.status === 'misconfigured') {
        return new NextResponse(null, { status: 503 });
      }

      return new NextResponse(null, { status: 401 });
    }

    // Payment/auth provider webhooks bypass all checks including maintenance mode.
    if (isProviderWebhookRoute(pathname)) {
      return nextWithProxyContext(request);
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
        const ctx = buildProxyRequestContext(request);
        console.debug('[dev_auth_bypass]', {
          event: 'dev_auth_bypass',
          userId: devAuthEnv.userId,
          pathname,
          correlationId: ctx.correlationId,
        });
        return nextWithProxyContext(request, { ctx });
      }

      await auth.protect();
    }

    return nextWithProxyContext(request);
  },
  {
    signInUrl: '/auth/sign-in',
    signUpUrl: '/auth/sign-up',
  },
);

export default proxy;

export const config = {
  matcher: [
    // Workflow SDK machine routes run an early auth branch before Clerk/CSP.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
