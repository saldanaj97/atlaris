/**
 * Generation failure classification taxonomy. Lives in its own file so
 * server-side query types and client-side response types can share it
 * without dragging in a dependency on each other.
 */
export const FAILURE_CLASSIFICATIONS = [
  'validation',
  'conflict',
  'provider_error',
  'rate_limit',
  'timeout',
  'capped',
] as const;

export type FailureClassification = (typeof FAILURE_CLASSIFICATIONS)[number];
