import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { revalidatePath } from 'next/cache';

/**
 * Revalidates app paths after a successful mutation without failing the mutation
 * when cache invalidation throws (e.g. transient Next cache/runtime issues).
 */
export function revalidatePathsBestEffort(paths: readonly string[]): void {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      logger.warn(
        { path, err: serializeErrorForLog(error) },
        'Failed to revalidate path after mutation',
      );
    }
  }
}
