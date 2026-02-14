import { ZodError } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { RateLimitError, ValidationError } from '@/lib/api/errors';
import {
  insertPlanWithRollback,
  preparePlanCreationPreflight,
} from '@/lib/api/plans/preflight';
import { requireInternalUserByAuthId } from '@/lib/api/plans/route-context';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';
import { createLearningPlanSchema } from '@/lib/validation/learningPlans';

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

    // Draft plan creation should not be blocked by the durable generation
    // window cap; execution endpoints enforce that cap. We still expose
    // advisory remaining headers for clients.
    let generationRateLimitHeaders: Record<string, string>;
    try {
      const { remaining } = await checkPlanGenerationRateLimit(
        preflight.data.user.id,
        db
      );
      generationRateLimitHeaders = getPlanGenerationRateLimitHeaders(remaining);
    } catch (error) {
      if (error instanceof RateLimitError) {
        generationRateLimitHeaders = getPlanGenerationRateLimitHeaders(0);
      } else {
        throw error;
      }
    }

    const created = await insertPlanWithRollback({
      body,
      preflight: preflight.data,
      dbClient: db,
    });

    // Build response from preflight + insert result to avoid post-insert re-fetch
    // under RLS (same user context should see the row, but avoids dependency on
    // visibility and gives consistent 201 semantics).
    const now = new Date();
    return json(
      {
        id: created.id,
        topic: preflight.data.preparedInput.topic,
        skillLevel: body.skillLevel,
        weeklyHours: body.weeklyHours,
        learningStyle: body.learningStyle,
        visibility: 'private',
        origin: preflight.data.preparedInput.origin,
        createdAt: now.toISOString(),
        status: 'generating',
      },
      { status: 201, headers: generationRateLimitHeaders }
    );
  })
);
