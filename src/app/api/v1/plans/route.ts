import { ZodError } from 'zod';

import { count, eq, inArray } from 'drizzle-orm';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { db } from '@/lib/db/drizzle';
import { getPlanSummariesForUser, getUserByClerkId } from '@/lib/db/queries';
import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import type { NewLearningPlan } from '@/lib/types/db';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
} from '@/lib/validation/learningPlans';

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

export const GET = withErrorBoundary(
  withAuth(async ({ userId }) => {
    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new ValidationError('User record not found.');
    }

    const summaries = await getPlanSummariesForUser(user.id);
    return json(summaries);
  })
);

async function findCappedPlanWithoutModules(userDbId: string) {
  const planRows = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userDbId));

  if (!planRows.length) {
    return null;
  }

  const planIds = planRows.map((row) => row.id);

  const attemptAggregates = await db
    .select({
      planId: generationAttempts.planId,
      count: count(generationAttempts.id).as('count'),
    })
    .from(generationAttempts)
    .where(inArray(generationAttempts.planId, planIds))
    .groupBy(generationAttempts.planId);

  if (!attemptAggregates.length) {
    return null;
  }

  const cappedPlanIds = attemptAggregates
    .filter((row) => row.count >= ATTEMPT_CAP)
    .map((row) => row.planId);

  if (!cappedPlanIds.length) {
    return null;
  }

  const plansWithModules = await db
    .select({ planId: modules.planId })
    .from(modules)
    .where(inArray(modules.planId, cappedPlanIds))
    .groupBy(modules.planId);

  const plansWithModulesSet = new Set(
    plansWithModules.map((row) => row.planId)
  );

  return (
    cappedPlanIds.find((planId) => !plansWithModulesSet.has(planId)) ?? null
  );
}

export const POST = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    let body: CreateLearningPlanInput;
    try {
      body = createLearningPlanSchema.parse(await req.json());
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError('Invalid request body.', error.flatten());
      }
      throw new ValidationError('Invalid request body.', error);
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new ValidationError('User record not found. Cannot create plan.');
    }

    const insertPayload: NewLearningPlan = {
      userId: user.id,
      topic: body.topic,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
      visibility: body.visibility,
      origin: body.origin,
    };

    const cappedPlanId = await findCappedPlanWithoutModules(user.id);
    if (cappedPlanId) {
      throw new AttemptCapExceededError('attempt cap reached', {
        planId: cappedPlanId,
      });
    }

    const [plan] = await db
      .insert(learningPlans)
      .values(insertPayload)
      .returning();

    // Notes from onboarding are intentionally ignored until the schema introduces a column.

    if (!plan) {
      throw new ValidationError('Failed to create learning plan.');
    }

    const schedule =
      typeof setImmediate === 'function'
        ? (fn: () => void) => setImmediate(fn)
        : (fn: () => void) => setTimeout(fn, 0);

    schedule(() => {
      runGenerationAttempt({
        planId: plan.id,
        userId: user.id,
        input: {
          topic: body.topic,
          notes: body.notes ?? null,
          skillLevel: body.skillLevel,
          weeklyHours: body.weeklyHours,
          learningStyle: body.learningStyle,
        },
      }).catch((error: unknown) => {
        const code = (() => {
          if (typeof error === 'object' && error !== null) {
            const direct = (error as { code?: string }).code;
            if (direct) return direct;

            const cause = (error as { cause?: unknown }).cause;
            if (typeof cause === 'object' && cause !== null) {
              return (cause as { code?: string }).code;
            }
          }
          return undefined;
        })();

        if (code === '23503') {
          // Plan was removed before the async generation attempt could persist.
          return;
        }

        console.error('Failed to run background generation attempt', {
          planId: plan.id,
          error,
        });
      });
    });

    return json(
      {
        id: plan.id,
        topic: plan.topic,
        skillLevel: plan.skillLevel,
        weeklyHours: plan.weeklyHours,
        learningStyle: plan.learningStyle,
        visibility: plan.visibility,
        origin: plan.origin,
        createdAt: plan.createdAt?.toISOString(),
        status: 'pending' as const,
      },
      { status: 201 }
    );
  })
);
