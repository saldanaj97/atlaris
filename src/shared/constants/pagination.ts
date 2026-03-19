/**
 * API response pagination bounds for list endpoints.
 * These are route-level limits, not database schema constraints.
 */
export const DEFAULT_PAGE_SIZE = 20 as const;
export const MAX_PAGE_SIZE = 100 as const;

const PAGINATION_DEFAULTS = {
  limit: DEFAULT_PAGE_SIZE,
  offset: 0,
} as const;

const PAGINATION_MINIMUMS = {
  limit: 1,
  offset: 0,
} as const;

export type PaginationField = keyof typeof PAGINATION_DEFAULTS;
export type PaginationOptions = Partial<Record<PaginationField, number>>;

export function getPaginationDefault(field: PaginationField): number {
  return PAGINATION_DEFAULTS[field];
}

export function getPaginationMinimum(field: PaginationField): number {
  return PAGINATION_MINIMUMS[field];
}

export function isValidPaginationValue(
  field: PaginationField,
  value: number
): boolean {
  return Number.isInteger(value) && value >= PAGINATION_MINIMUMS[field];
}

export function clampPageSize(value: number): number {
  return Math.min(value, MAX_PAGE_SIZE);
}

export function assertValidPaginationOptions(
  options?: PaginationOptions
): void {
  if (
    options?.limit !== undefined &&
    !isValidPaginationValue('limit', options.limit)
  ) {
    throw new RangeError(
      `limit must be an integer greater than or equal to ${PAGINATION_MINIMUMS.limit}`
    );
  }

  if (
    options?.offset !== undefined &&
    !isValidPaginationValue('offset', options.offset)
  ) {
    throw new RangeError(
      `offset must be an integer greater than or equal to ${PAGINATION_MINIMUMS.offset}`
    );
  }
}
