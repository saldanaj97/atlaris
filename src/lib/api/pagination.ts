import { ValidationError } from '@/lib/api/errors';

export interface ListPaginationOptions {
  /**
   * Default `limit` value when the query string omits it. Routes choose this
   * intentionally (e.g. /v1/plans defaults to 20, /v1/resources to 50).
   */
  defaultLimit: number;
  /** Hard upper bound on `limit`. Values above this are clamped down. */
  maxLimit: number;
}

export interface ListPaginationResult {
  limit: number;
  offset: number;
}

function parseField(
  rawValue: string | null,
  field: 'limit' | 'offset',
  defaultValue: number,
  minimum: number,
): number {
  if (rawValue === null) return defaultValue;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new ValidationError(
      `${field} must be an integer greater than or equal to ${minimum}`,
      { [field]: rawValue },
    );
  }
  return parsed;
}

/**
 * Centralized parser for `limit`/`offset` query params used by list endpoints.
 * Each route supplies its own `defaultLimit` and `maxLimit` so existing API
 * contracts (e.g. /v1/plans default 20, /v1/resources default 50) are preserved.
 */
export function parseListPaginationParams(
  searchParams: URLSearchParams,
  options: ListPaginationOptions,
): ListPaginationResult {
  const limitRaw = searchParams.get('limit');
  const offsetRaw = searchParams.get('offset');

  const limit = parseField(limitRaw, 'limit', options.defaultLimit, 1);
  const offset = parseField(offsetRaw, 'offset', 0, 0);

  return {
    limit: Math.min(limit, options.maxLimit),
    offset,
  };
}
