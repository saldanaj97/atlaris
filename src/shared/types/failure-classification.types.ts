/**
 * Generation failure classification taxonomy. Lives in its own file so
 * server-side query types and client-side response types can share it
 * without dragging in a dependency on each other.
 */
export type FailureClassification =
	| 'validation'
	| 'conflict'
	| 'provider_error'
	| 'rate_limit'
	| 'timeout'
	| 'capped';
