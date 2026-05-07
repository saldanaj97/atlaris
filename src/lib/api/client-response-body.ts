import { parseApiErrorResponse } from '@/lib/api/error-response';

type ParsedApiError = Awaited<ReturnType<typeof parseApiErrorResponse>>;

/**
 * If `response.ok`, returns null. Otherwise parses canonical API error JSON.
 */
export async function parseApiErrorUnlessOk(
  response: Response,
  fallbackMessage: string,
): Promise<ParsedApiError | null> {
  if (response.ok) {
    return null;
  }
  return parseApiErrorResponse(response, fallbackMessage);
}

export function clientErrorFieldsFromParsedApi(parsed: ParsedApiError): {
  message: string;
  error: Error;
} {
  return {
    message: parsed.error,
    error: new Error(parsed.error),
  };
}

export async function readResponseJsonBody(
  response: Response,
): Promise<
  { kind: 'body'; raw: unknown } | { kind: 'parse-error'; error: unknown }
> {
  return response
    .json()
    .then((raw: unknown) => ({ kind: 'body' as const, raw }))
    .catch((error: unknown) => ({ kind: 'parse-error' as const, error }));
}
