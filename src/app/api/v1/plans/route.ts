import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

/**
 * GET /api/v1/plans
 * Planned behavior (not yet implemented):
 *  - Return lightweight list of user's plans with: id, title, createdAt, status, topic, progressSummary
 *  - `status` reflects async generation lifecycle: 'pending' | 'ready' | 'failed'
 *  - `progressSummary` may later include precomputed completion ratio (avoid heavy joins in list view)
 *  - Pagination & filtering (topic, status) can be added via query params.
 *
 * POST /api/v1/plans (async creation flow - NOT IMPLEMENTED)
 *  Overview of the future async model (Option B selected):
 *    1. Validate input (topic, skillLevel, learningStyle, weeklyHours, durationWeeks) via schema.
 *    2. Insert a new plan row with status='pending'. No modules/tasks yet.
 *    3. Enqueue a background job (queue provider TBD) referencing planId + userId.
 *    4. Return 202 Accepted { planId, status:'pending' } immediately.
 *    5. Worker consumes job: calls AI provider -> synthesizes structured modules/tasks.
 *    6. Worker inserts modules + tasks (ordered), updates plan status='ready'. On failure status='failed' + error message.
 *    7. Client polls GET /api/v1/plans/[planId] or subscribes (future: SSE/WebSocket) until status transitions.
 *
 *  Additional considerations (documented for later implementation):
 *    - Idempotency: Provide optional client-generated idempotency key header to avoid duplicate submissions.
 *    - Rate limiting: Enforce per-user plan creation quota + burst limits.
 *    - Observability: Store generation metadata in a plan_generations history table (timestamp, parameters, model, duration, status, error).
 *    - Cancellation: (Future) Allow user to cancel generation if still pending.
 *    - Soft deletion: current design assumes hard delete; revisit before launch for recovery UX.
 *
 *  NOTE: This file intentionally contains only placeholders; no business logic should be added yet.
 */

export const GET = withErrorBoundary(withAuth(async () => notImplemented()));

export const POST = withErrorBoundary(withAuth(async () => notImplemented()));
