import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

/**
 * GET /api/v1/plans/:planId/progress (future)
 *  Planned payload shape:
 *    {
 *      planId: string,
 *      completion: number,            // 0..1
 *      totalTasks: number,
 *      completedTasks: number,
 *      modules: [
 *        { moduleId, completion, totalTasks, completedTasks }
 *      ],
 *      updatedAt: string              // ISO computed timestamp
 *    }
 *
 *  Implementation approach (initial):
 *    - Query tasks + task_progress join, aggregate counts in memory.
 *    - Later optimization: maintain a materialized table or cached aggregate updated on task progress mutation.
 *
 *  Performance considerations:
 *    - Debounce or cache per (planId,userId) for a few seconds if UI polls frequently.
 *    - Provide ETag/Last-Modified for conditional requests.
 */

export const GET = withErrorBoundary(withAuth(async () => notImplemented()));
