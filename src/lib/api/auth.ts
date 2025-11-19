import * as Sentry from '@sentry/nextjs';

import { appEnv, devClerkEnv } from '@/lib/config/env';
import { initSentry } from '@/lib/observability/sentry';
import { createRequestContext, withRequestContext } from './context';
import { AuthError } from './errors';

/**
 * Returns the effective Clerk user id for the current request.
 * In development or test (Vitest), if DEV_CLERK_USER_ID is set, that value is returned
 * (allowing you to bypass real Clerk provisioning while seeding a deterministic user).
 *
 * NOTE: In Vitest test runs, we avoid importing '@clerk/nextjs/server' entirely.
 * This prevents server-only module guards from firing when tests exercise auth-aware
 * helpers (e.g., gating middleware) outside of a real Next.js server context.
 */
export async function getEffectiveClerkUserId(): Promise<string | null> {
  // In Vitest, rely solely on DEV_CLERK_USER_ID and never import Clerk.
  // This keeps auth-dependent helpers usable in pure Node test environments.
  if (appEnv.vitestWorkerId) {
    const devUserId = devClerkEnv.userId;
    return devUserId || null;
  }

  // In non-production runtimes, prefer DEV_CLERK_USER_ID when present.
  if (!appEnv.isProduction) {
    const devUserId = devClerkEnv.userId;
    if (devUserId !== undefined) {
      // Return the value as-is, converting empty string to null
      return devUserId || null;
    }
  }
  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * Returns the Clerk user id from the actual Clerk session, ignoring
 * DEV_CLERK_USER_ID overrides. This is intended for security-sensitive flows
 * (e.g. OAuth callbacks) where we must validate the currently authenticated
 * end user rather than a test/development override.
 */
export async function getClerkAuthUserId(): Promise<string | null> {
  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  return userId ?? null;
}

export async function requireUser() {
  const userId = await getEffectiveClerkUserId();
  if (!userId) throw new AuthError();
  return userId;
}

type RouteHandlerParams = Record<string, string | undefined>;

type HandlerCtx = {
  req: Request;
  userId: string;
  params: RouteHandlerParams;
};

type Handler = (ctx: HandlerCtx) => Promise<Response>;

export type RouteHandlerContext = {
  params?: Promise<Record<string, string>>;
  [key: string]: unknown;
};

export type PlainHandler = (
  req: Request,
  context?: RouteHandlerContext
) => Promise<Response>;

export function withAuth(handler: Handler): PlainHandler {
  return async (req: Request, routeContext?: RouteHandlerContext) => {
    initSentry();
    const userId = await requireUser();

    // Create RLS-enforced database client for this request
    // This client automatically scopes all queries to the authenticated user
    const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
    const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(userId);

    // Create request context with the RLS-enforced DB and cleanup function
    const requestContext = createRequestContext(req, userId, rlsDb, cleanup);

    const params: RouteHandlerParams = routeContext?.params
      ? await routeContext.params
      : {};

    try {
      return await withRequestContext(requestContext, () =>
        handler({ req, userId, params })
      );
    } finally {
      // Always close the database connection when the request completes
      // This prevents connection leaks in long-running server processes
      await cleanup();
    }
  };
}

export function withErrorBoundary(fn: PlainHandler): PlainHandler {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (e) {
      initSentry();
      if (e instanceof Error) {
        Sentry.captureException(e);
      }
      const { toErrorResponse } = await import('./errors');
      return toErrorResponse(e);
    }
  };
}

export function compose(...fns: ((h: PlainHandler) => PlainHandler)[]) {
  return (final: PlainHandler): PlainHandler =>
    fns.reduceRight((acc, fn) => fn(acc), final);
}
