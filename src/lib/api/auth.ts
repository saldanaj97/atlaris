import { auth } from '@clerk/nextjs/server';
import { AuthError } from './errors';

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new AuthError();
  return userId;
}

type HandlerCtx = { req: Request; userId: string };

type Handler = (ctx: HandlerCtx) => Promise<Response>;

type PlainHandler = (req: Request) => Promise<Response>;

export function withAuth(handler: Handler): PlainHandler {
  return async (req: Request) => {
    const userId = await requireUser();
    return handler({ req, userId });
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
