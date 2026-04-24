import { toApiErrorJsonResponse } from '@/lib/api/error-response';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

interface JsonOptions {
	status?: number;
	headers?: Record<string, string>;
}

export function json<Data>(data: Data, options: JsonOptions = {}) {
	const { status = 200, headers = {} } = options;
	return Response.json(data, { status, headers });
}

export function jsonError(
	message: string,
	options: {
		status?: number;
		code?: string;
		classification?: FailureClassification;
		details?: unknown;
		retryAfter?: number;
		headers?: Record<string, string>;
	} = {},
) {
	return toApiErrorJsonResponse(message, options);
}
