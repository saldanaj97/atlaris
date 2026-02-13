import { ZodError } from 'zod';

import { eq } from 'drizzle-orm';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import {
  insertPlanWithRollback,
  preparePlanCreationPreflight,
} from '@/lib/api/plans/preflight';
import { requireInternalUserByAuthId } from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
} from '@/lib/validation/learningPlans';

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ userId }) => {
    const db = getDb();
    const user = await requireInternalUserByAuthId(userId);
    const summaries = await getPlanSummariesForUser(user.id, db);
    return json(summaries);
  })
);

// Use shared validation constants to avoid duplication

export const POST = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, userId }) => {
    let body: CreateLearningPlanInput;
    try {
      body = createLearningPlanSchema.parse(await req.json());
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError('Invalid request body.', error.flatten());
      }
      const details = error instanceof Error ? error : String(error);
      throw new ValidationError('Invalid request body.', details);
    }

    const db = getDb();
    const preflight = await preparePlanCreationPreflight({
      body,
      authUserId: userId,
      dbClient: db,
    });

    if (!preflight.ok) {
      return preflight.response;
    }

    const created = await insertPlanWithRollback({
      body,
      preflight: preflight.data,
      dbClient: db,
    });
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, created.id))
      .limit(1);

    // Notes from onboarding are intentionally ignored until the schema introduces a column.

    if (!plan) {
      throw new ValidationError('Failed to create learning plan.');
    }

    // Note: Plan generation now happens via the streaming endpoint (/api/v1/plans/stream).
    // This endpoint only creates the plan record. The frontend should redirect to the
    // streaming endpoint or the plan page where generation can be initiated.

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
        status: 'generating',
      },
      { status: 201 }
    );
  })
);
