import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

/**
 * POST /api/v1/ai/generate-plan (future async creator)
 *  This endpoint may remain a semantic alias of POST /api/v1/plans or be removed in favor of a single plan creation endpoint.
 *  If kept separate, it can focus on pure AI generation preview before committing:
 *    Mode A (Commit Now - selected for MVP): Accepts input -> creates pending plan -> enqueues job.
 *    Mode B (Preview): Accepts input -> returns AI draft (not persisted) -> client confirms -> separate POST /plans to persist.
 *
 *  Current decision: implement Mode A only, with a TODO for optional preview mode later.
 *
 *  NOTE: If both endpoints coexist, ensure shared schema & DRY generation orchestration utility.
 */

export const POST = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async () => notImplemented())
);
