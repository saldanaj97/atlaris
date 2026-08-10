import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { revalidatePath } from 'next/cache';

export type RevalidatePathsResult = {
  readonly failedPaths: readonly string[];
};

/**
 * Revalidates app paths after a successful mutation without failing the mutation
 * when cache invalidation throws (e.g. transient Next cache/runtime issues).
 */
export function revalidatePathsBestEffort(
  paths: readonly string[],
): RevalidatePathsResult {
  const failedPaths: string[] = [];

  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      failedPaths.push(path);
      logger.warn(
        {
          path,
          err: serializeErrorForLog(error),
          revalidatePartialFailure: true,
        },
        'Failed to revalidate path after mutation',
      );
    }
  }

  return { failedPaths };
}
