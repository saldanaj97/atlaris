import type { z } from 'zod';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';

function getClientErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function isTimeoutAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

type JsonRequestResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown };

export async function requestJson<T>(params: {
  url: string;
  init?: RequestInit;
  schema: z.ZodType<T>;
  fallbackMessage: string;
  timeoutMs?: number;
}): Promise<JsonRequestResult<T>> {
  const timeoutSignal =
    params.timeoutMs === undefined
      ? null
      : AbortSignal.timeout(params.timeoutMs);
  const signal =
    timeoutSignal && params.init?.signal
      ? AbortSignal.any([params.init.signal, timeoutSignal])
      : (timeoutSignal ?? params.init?.signal);

  const init: RequestInit = {
    ...params.init,
    signal,
  };

  let response: Response;

  try {
    response = await fetch(params.url, init);
  } catch (error: unknown) {
    if (isAbortError(error) || isTimeoutAbortError(error)) {
      const timedOut =
        isTimeoutAbortError(error) ||
        (timeoutSignal?.reason instanceof DOMException &&
          timeoutSignal.reason.name === 'TimeoutError');

      if (timedOut) {
        return {
          kind: 'error',
          message: 'Request timed out — please try again',
          error,
        };
      }

      return { kind: 'aborted' };
    }

    return {
      kind: 'error',
      message: getClientErrorMessage(error, params.fallbackMessage),
      error,
    };
  }

  if (!response.ok) {
    const parsed = await parseApiErrorResponse(
      response,
      params.fallbackMessage,
    );
    return {
      kind: 'error',
      message: parsed.error,
      error: new Error(parsed.error),
    };
  }

  let rawBody: unknown;

  try {
    rawBody = await response.json();
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return { kind: 'aborted' };
    }

    return {
      kind: 'error',
      message: params.fallbackMessage,
      error,
    };
  }

  const parsedData = params.schema.safeParse(rawBody);
  if (!parsedData.success) {
    return {
      kind: 'error',
      message: parsedData.error.issues[0]?.message ?? params.fallbackMessage,
      error: parsedData.error,
    };
  }

  return {
    kind: 'success',
    data: parsedData.data,
  };
}
