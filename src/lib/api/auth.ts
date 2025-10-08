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

type HandlerCtx = { req: Request; userId: string };

type Handler = (ctx: HandlerCtx) => Promise<Response>;

export type PlainHandler = (req: Request) => Promise<Response>;

export function withAuth(handler: Handler): PlainHandler {
  return async (req: Request) => {
    const userId = await requireUser();
    const context = createRequestContext(req, userId);
    return withRequestContext(context, () => handler({ req, userId }));
  };
}

export function withErrorBoundary(fn: PlainHandler): PlainHandler {
  return async (req) => {
    try {
      return await fn(req);
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
