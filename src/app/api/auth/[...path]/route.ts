import { auth } from '@/lib/auth/server';
import { RateLimitError, toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit as realCheckIpRateLimit } from '@/lib/api/ip-rate-limit';
import { logger } from '@/lib/logging/logger';

const handlers = auth.handler();
type AuthRouteHandler = typeof handlers.GET;

export type CreateAuthHandlersDeps = {
  checkIpRateLimit: typeof realCheckIpRateLimit;
};

function withAuthIpRateLimit(
  handler: AuthRouteHandler,
  checkIpRateLimit: CreateAuthHandlersDeps['checkIpRateLimit']
): AuthRouteHandler {
  return async (request, context) => {
    try {
      await checkIpRateLimit(request, 'auth');
      return await handler(request, context);
    } catch (error) {
      if (error instanceof RateLimitError) {
        logger.warn(
          {
            method: request.method,
            url: request.url,
            retryAfter: error.retryAfter,
            code: error.code(),
            message: error.message,
          },
          'auth route rate limit hit'
        );
      } else {
        logger.error(
          {
            method: request.method,
            url: request.url,
            error,
            stack: error instanceof Error ? error.stack : undefined,
          },
          'auth route error'
        );
      }
      return toErrorResponse(error);
    }
  };
}

export function createAuthHandlers(deps: CreateAuthHandlersDeps): {
  GET: AuthRouteHandler;
  POST: AuthRouteHandler;
} {
  const { checkIpRateLimit } = deps;
  const h = auth.handler();
  return {
    GET: withAuthIpRateLimit(h.GET, checkIpRateLimit),
    POST: withAuthIpRateLimit(h.POST, checkIpRateLimit),
  };
}

const { GET, POST } = createAuthHandlers({
  checkIpRateLimit: realCheckIpRateLimit,
});
export { GET, POST };
