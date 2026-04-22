import { toErrorResponse } from '@/lib/api/errors';
import type { AuthHandler, PlainHandler } from '@/lib/api/types/auth.types';
import type { UserRateLimitCategory } from '@/lib/api/user-rate-limit';
import {
	checkUserRateLimit,
	getUserRateLimitHeaders,
} from '@/lib/api/user-rate-limit';
import { isAbortError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

export function withErrorBoundary(fn: PlainHandler): PlainHandler {
	return async (req: Request, context) => {
		try {
			return await fn(req, context);
		} catch (e) {
			if (isAbortError(e)) {
				logger.debug(
					{ url: req.url, method: req.method },
					'Request aborted by client',
				);
				return new Response(null, {
					status: 499,
					headers: { Connection: 'close' },
				});
			}
			logger.error({ error: e }, 'Unhandled API route error');
			return toErrorResponse(e);
		}
	};
}

export function withRateLimit(
	category: UserRateLimitCategory,
): (handler: AuthHandler) => AuthHandler {
	return (handler: AuthHandler): AuthHandler => {
		return async (
			ctx: Parameters<AuthHandler>[0],
		): Promise<Awaited<ReturnType<AuthHandler>>> => {
			// `checkUserRateLimit` throws `RateLimitError` when the user exceeds the window.
			checkUserRateLimit(ctx.userId, category);
			const response = await handler(ctx);

			const rateLimitHeaders = getUserRateLimitHeaders(ctx.userId, category);
			const headers = new Headers(response.headers);
			for (const [name, value] of Object.entries(rateLimitHeaders)) {
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
