import { randomUUID } from 'node:crypto';

import type { Logger } from './logger';
import { createLogger } from './logger';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestContext {
  requestId: string;
  logger: Logger;
}

export function createRequestContext(
  request: Pick<Request, 'headers'>,
  context: Record<string, unknown> = {}
): RequestContext {
  const incomingId = request.headers.get(REQUEST_ID_HEADER);
  const trimmedId = incomingId?.trim();
  const requestId = trimmedId ? trimmedId : randomUUID();

  return {
    requestId,
    logger: createLogger({ requestId, ...context }),
  };
}

export function attachRequestIdHeader(
  response: Response,
  requestId: string
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
