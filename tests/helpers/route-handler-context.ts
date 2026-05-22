import type { RouteHandlerContext } from '@/lib/api/types/auth.types';

/** Next.js route handler context for direct handler invocation in tests. */
export function buildRouteHandlerContext(
  params: Record<string, string>,
): RouteHandlerContext {
  return { params: Promise.resolve(params) };
}
