import type { AuthHandler, PlainHandler } from '@/lib/api/types/auth.types';
import type { UserRateLimitCategory } from '@/lib/api/user-rate-limit';
import {
  checkUserRateLimit,
  getUserRateLimitHeaders,
} from '@/lib/api/user-rate-limit';

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

export function withRateLimit(
  category: UserRateLimitCategory
): (handler: AuthHandler) => AuthHandler {
  return (handler: AuthHandler) => {
    return async (ctx) => {
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
