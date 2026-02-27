import { auth, getSessionSafe } from '@/lib/auth/server';
import { appEnv, devAuthEnv } from '@/lib/config/env';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import type { RlsClient } from '@/lib/db/rls';
import { createUser, getUserByAuthId } from '@/lib/db/queries/users';
import {
  createRequestContext,
  withRequestContext,
  type RequestContext,
} from '@/lib/api/context';
import { AuthError } from './errors';
import {
  checkUserRateLimit,
  getUserRateLimitHeaders,
  type UserRateLimitCategory,
} from './user-rate-limit';

type MaybePromise<T> = T | Promise<T>;

/**
 * Returns the effective auth user id for the current request.
 * In development or test (Vitest), if DEV_AUTH_USER_ID is set, that value is returned
 * (allowing you to bypass real Neon auth provisioning while seeding a deterministic user).
 */
export async function getEffectiveAuthUserId(): Promise<string | null> {
  if (appEnv.vitestWorkerId) {
    const devUserId = devAuthEnv.userId;
    return devUserId || null;
  }

  if (appEnv.isDevelopment) {
    const devUserId = devAuthEnv.userId;
    if (devUserId !== undefined) {
      return devUserId || null;
    }
  }

  const { session } = await getSessionSafe();
  return session?.user?.id ?? null;
}

/**
 * Returns the auth user id from the actual Neon session, ignoring
 * DEV_AUTH_USER_ID overrides. This is intended for security-sensitive flows
 * (e.g. OAuth callbacks) where we must validate the currently authenticated
 * end user rather than a test/development override.
 *
 * Only call from Route Handlers or Server Actions (not Server Components).
 */
export async function getAuthUserId(): Promise<string | null> {
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Resolves the current auth user ID or throws AuthError.
 * Used internally by `withAuth` and `requireCurrentUserRecord`.
 */
export async function requireUser(): Promise<string> {
  const userId = await getEffectiveAuthUserId();
  if (!userId) throw new AuthError();
  return userId;
}

async function ensureUserRecord(authUserId: string): Promise<DbUser> {
  const existing = await getUserByAuthId(authUserId);
  if (existing) {
    return existing;
  }

  const { data: session } = await auth.getSession();

  if (!session?.user) {
    throw new AuthError('Auth user data unavailable.');
  }

  const email = session.user.email;
  if (!email) {
    throw new AuthError('Auth user must have an email address.');
  }

  const created = await createUser({
    authUserId,
    email,
    name: session.user.name || undefined,
  });

  if (!created) {
    throw new AuthError('Failed to provision user record.');
  }

  return created;
}

export async function requireCurrentUserRecord(): Promise<DbUser> {
  const userId = await requireUser();
  return ensureUserRecord(userId);
}

/**
 * Private helper encapsulating shared auth + RLS + context + cleanup logic
 * used by withAuth, withServerComponentContext, and withServerActionContext.
 */
async function runWithAuthenticatedContext<T>(
  authUserId: string,
  fn: (user: DbUser, rlsDb: RlsClient) => MaybePromise<T>,
  req?: Request
): Promise<T> {
  const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
  const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(authUserId);

  const requestContext: RequestContext = req
    ? createRequestContext(req, { userId: authUserId, db: rlsDb, cleanup })
    : {
        correlationId: crypto.randomUUID(),
        userId: authUserId,
        db: rlsDb,
        cleanup,
      };

  try {
    return await withRequestContext(requestContext, async () => {
      const user = await ensureUserRecord(authUserId);
      requestContext.user = { id: user.id, authUserId: user.authUserId };
      return fn(user, rlsDb);
    });
  } finally {
    await cleanup();
  }
}

type RouteHandlerParams = Record<string, string | undefined>;

type HandlerCtx = {
  req: Request;
  userId: string;
  user: DbUser;
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
    const params: RouteHandlerParams = routeContext?.params
      ? await routeContext.params
      : {};

    if (appEnv.isTest) {
      const user = await requireCurrentUserRecord();
      const userId = user.authUserId;
      const requestContext = createRequestContext(req, { userId, user });

      return await withRequestContext(requestContext, () =>
        handler({ req, userId, user, params })
      );
    }

    const authUserId = await requireUser();

    return runWithAuthenticatedContext(
      authUserId,
      (user) => handler({ req, userId: authUserId, user, params }),
      req
    );
  };
}

export function withErrorBoundary(fn: PlainHandler): PlainHandler {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (e) {
      const { toErrorResponse } = await import('./errors');
      return toErrorResponse(e);
    }
  };
}

export function compose(...fns: ((h: PlainHandler) => PlainHandler)[]) {
  return (final: PlainHandler): PlainHandler =>
    fns.reduceRight((acc, fn) => fn(acc), final);
}

/**
 * Establishes an RLS-enforced DB context for Server Components.
 * This is the Server Component equivalent of `withAuth` for API routes.
 *
 * Returns null if the user is not authenticated.
 */
export async function withServerComponentContext<T>(
  fn: (user: DbUser) => MaybePromise<T>
): Promise<T | null> {
  const authUserId = await getEffectiveAuthUserId();
  if (!authUserId) return null;

  if (appEnv.isTest) {
    // In test mode, withServerComponentContext intentionally skips full request
    // context setup (correlationId, RLS client, cleanup) because Server Components
    // don't have a Request object and tests calling this path only need the user
    // record. withAuth and withServerActionContext set up request context because
    // they operate within a request/action lifecycle.
    const user = await ensureUserRecord(authUserId);
    return fn(user);
  }

  return runWithAuthenticatedContext(authUserId, (user) => fn(user));
}

/**
 * Wrapper for Server Actions that sets up authenticated RLS context.
 * Equivalent to withServerComponentContext but designed for 'use server' functions.
 * Handles auth, RLS client creation, user lookup, and cleanup.
 *
 * Also passes the RLS db client to the callback since server actions
 * often need to pass it explicitly to query functions.
 *
 * Returns null if user is not authenticated (caller should handle).
 */
export async function withServerActionContext<T>(
  fn: (user: DbUser, db: RlsClient) => MaybePromise<T>
): Promise<T | null> {
  const authUserId = await getEffectiveAuthUserId();
  if (!authUserId) return null;

  return runWithAuthenticatedContext(authUserId, fn);
}

export function withRateLimit(
  category: UserRateLimitCategory
): (handler: Handler) => Handler {
  return (handler: Handler) => {
    return async (ctx: HandlerCtx) => {
      checkUserRateLimit(ctx.userId, category);
      const response = await handler(ctx);

      const rateLimitHeaders = getUserRateLimitHeaders(ctx.userId, category);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(rateLimitHeaders)) {
        // Use set() so existing values are replaced case-insensitively.
        headers.set(name, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };
  };
}

export function withAuthAndRateLimit(
  category: UserRateLimitCategory,
  handler: Handler
): PlainHandler {
  return withAuth(withRateLimit(category)(handler));
}
