import type { z } from 'zod';
import {
  clientErrorFieldsFromParsedApi,
  parseApiErrorUnlessOk,
  readResponseJsonBody,
} from '@/lib/api/client-response-body';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';

export function getClientErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  if (typeof AbortSignal.timeout === 'function') {
    const signal = AbortSignal.timeout(timeoutMs);
    let timedOut = false;

    const onAbort = (): void => {
      if (
        signal.reason instanceof DOMException &&
        signal.reason.name === 'TimeoutError'
      ) {
        timedOut = true;
      }
    };

    signal.addEventListener('abort', onAbort);

    return {
      signal,
      cleanup: () => {
        signal.removeEventListener('abort', onAbort);
      },
      didTimeout: () => timedOut,
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
    },
    didTimeout: () => timedOut,
  };
}

export function isTimeoutAbortError(error: unknown): error is DOMException {
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
      : createTimeoutSignal(params.timeoutMs);

  const init: RequestInit = {
    ...params.init,
    signal: timeoutSignal === null ? params.init?.signal : timeoutSignal.signal,
  };

  let response: Response;

  try {
    response = await fetch(params.url, init);
  } catch (error: unknown) {
    timeoutSignal?.cleanup();

    if (isAbortError(error)) {
      const timedOut =
        timeoutSignal?.didTimeout() === true || isTimeoutAbortError(error);

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
  } finally {
    timeoutSignal?.cleanup();
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

type PostJsonRequestResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'error'; message: string; error: unknown };

export async function requestPostJson<T>(params: {
  url: string;
  body: unknown;
  schema: z.ZodType<T>;
  fallbackMessage: string;
  timeoutMs: number;
  mapSchemaError?: (issue: {
    code?: string;
    message?: string;
    path?: readonly PropertyKey[];
  }) => string | undefined;
}): Promise<PostJsonRequestResult<T>> {
  const timeoutSignal = createTimeoutSignal(params.timeoutMs);
  const responseResult = await fetch(params.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.body),
    signal: timeoutSignal.signal,
  })
    .then((response) => ({ kind: 'response' as const, response }))
    .catch((error: unknown) => ({ kind: 'network-error' as const, error }))
    .finally(() => {
      timeoutSignal.cleanup();
    });

  if (responseResult.kind === 'network-error') {
    const requestTimedOut =
      isTimeoutAbortError(responseResult.error) || timeoutSignal.didTimeout();

    return {
      kind: 'error',
      message: requestTimedOut
        ? 'Request timed out — please try again'
        : getClientErrorMessage(responseResult.error, 'Something went wrong'),
      error: responseResult.error,
    };
  }

  const { response } = responseResult;

  const apiError = await parseApiErrorUnlessOk(
    response,
    params.fallbackMessage,
  );
  if (apiError !== null) {
    return {
      kind: 'error',
      ...clientErrorFieldsFromParsedApi(apiError),
    };
  }

  const bodyResult = await readResponseJsonBody(response);

  if (bodyResult.kind === 'parse-error') {
    return {
      kind: 'error',
      message: params.fallbackMessage,
      error: bodyResult.error,
    };
  }

  const parsed = params.schema.safeParse(bodyResult.raw);
  if (!parsed.success) {
    const mappedMessage = params.mapSchemaError?.(parsed.error.issues[0] ?? {});
    const message =
      mappedMessage ??
      parsed.error.issues[0]?.message ??
      params.fallbackMessage;

    return {
      kind: 'error',
      message,
      error: parsed.error,
    };
  }

  return {
    kind: 'success',
    data: parsed.data,
  };
}
