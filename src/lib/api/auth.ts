import { createRequestContext, withRequestContext } from './context';
import { AuthError } from './errors';

/**
 * Returns the effective Clerk user id for the current request.
 * In development or test (Vitest), if DEV_CLERK_USER_ID is set, that value is returned
 * (allowing you to bypass real Clerk provisioning while seeding a deterministic user).
 *
 * NOTE: We avoid a static import of '@clerk/nextjs/server' so test runs that rely on
 * DEV_CLERK_USER_ID do not trigger Next.js server-only module guards.
 */
export async function getEffectiveClerkUserId(): Promise<string | null> {
  // In test/dev mode, use DEV_CLERK_USER_ID if it's a non-empty string
  if (process.env.NODE_ENV !== 'production' || process.env.VITEST_WORKER_ID) {
    const devUserId = process.env.DEV_CLERK_USER_ID;
    if (devUserId !== undefined) {
      // Return the value as-is, converting empty string to null
      return devUserId || null;
    }
  }
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
    const userId = await requireUser();
    const requestContext = createRequestContext(req, userId);
    // NOTE: This change is preparatory - RLS enforcement is NOT yet active.
    // getDb() from @/lib/db/runtime currently returns service-role DB for all requests.
    // This means request handlers currently bypass RLS and must manually enforce
    // ownership checks via WHERE clauses. Until RLS is implemented, there is a
    // security risk if ownership validation is missed in any query.
    // TODO(#ISSUE_NUMBER): Implement RLS drizzle client when drizzle-orm/supabase-js is available
    const params: RouteHandlerParams = routeContext?.params
      ? await routeContext.params
      : {};
    return withRequestContext(requestContext, () =>
      handler({ req, userId, params })
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
