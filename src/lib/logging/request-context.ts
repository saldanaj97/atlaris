import * as Sentry from '@sentry/nextjs';

import { ensureCorrelationId } from '@/lib/api/context';

import type { Logger } from './logger';
import { createLogger } from './logger';

export const REQUEST_ID_HEADER = 'x-correlation-id';

type RequestContext = {
	requestId: string;
	logger: Logger;
};

export function createRequestContext(
	request: Pick<Request, 'headers'>,
	context: Record<string, unknown> = {},
): RequestContext {
	const requestId = ensureCorrelationId(request, REQUEST_ID_HEADER);

	Sentry.getIsolationScope().setAttributes({ request_id: requestId });

	return {
		requestId,
		logger: createLogger({ requestId, ...context }),
	};
}

export function getRequestContext(
	request: Pick<Request, 'headers'>,
	context: Record<string, unknown> = {},
): RequestContext {
	return createRequestContext(request, context);
}

export function attachRequestIdHeader(
	response: Response,
	requestId: string,
): Response {
	if (response.headers.has(REQUEST_ID_HEADER)) {
		return response;
	}

	const headers = new Headers(response.headers);
	headers.set(REQUEST_ID_HEADER, requestId);

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}
