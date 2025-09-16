import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

/**
 * GET /api/v1/plans/:planId (future behavior outline)
 *  - Returns full plan document including: id, title, description, topic, status, createdAt, updatedAt.
 *  - When status='pending': modules/tasks arrays may be empty or omitted; include a `generation` object with phase & queuedAt.
 *  - When status='failed': include `generation.error` with sanitized message + retryAvailable boolean.
 *  - When status='ready': include ordered modules -> tasks plus computed progress snapshot.
 *  - Consider ETag or Last-Modified headers for caching/polling efficiency.
 *
 * DELETE /api/v1/plans/:planId
 *  - Hard delete in MVP (cascades modules/tasks). TODO: evaluate soft delete with deletedAt for undo UX.
 *
 * PUT intentionally deferred (no direct user edits in MVP; regeneration flow supersedes manual editing).
 *
 * Security / Ownership:
 *  - Validate plan.userId === auth.userId. Return 404 instead of 403 to avoid existence leakage.
 *
 * Performance Considerations (future):
 *  - Preload progress aggregates (tasks_completed / total) in a side table to avoid recomputation on every fetch.
 *  - For large plans, introduce query param `?include=modules,tasks` or pagination for tasks.
 */

export const GET = withErrorBoundary(withAuth(async () => notImplemented()));

export const DELETE = withErrorBoundary(withAuth(async () => notImplemented()));

// NOTE: PUT omitted by design (see comment above)
