/**
 * Maps a nullable request-boundary result to a typed access result with UNAUTHORIZED fallback.
 */
export function finalizePageBoundaryResult<TSuccess, TUnauth>(
  boundaryResult: TSuccess | null,
  options: {
    entityId: string;
    unauthenticatedMessage: string;
    unauthenticated: (message: string) => TUnauth;
  },
): TSuccess | TUnauth {
  if (boundaryResult !== null) {
    return boundaryResult;
  }

  return options.unauthenticated(options.unauthenticatedMessage);
}
