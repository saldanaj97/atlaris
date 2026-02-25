import { ZodError } from 'zod';

import {
  type PlainHandler,
  withAuthAndRateLimit,
  withErrorBoundary,
} from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import {
  insertPlanWithRollback,
  preparePlanCreationPreflight,
} from '@/lib/api/plans/preflight';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';
import { createLearningPlanSchema } from '@/lib/validation/learningPlans';

export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }) => {
    const db = getDb();
    const summaries = await getPlanSummariesForUser(user.id, db);
    return json(summaries);
  })
);

// Use shared validation constants to avoid duplication

export const POST: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, userId, user }) => {
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
    const rateLimit = await checkPlanGenerationRateLimit(user.id, db);
    const generationRateLimitHeaders =
      getPlanGenerationRateLimitHeaders(rateLimit);

    const preflight = await preparePlanCreationPreflight({
      body,
      authUserId: userId,
      user,
      dbClient: db,
    });

    const created = await insertPlanWithRollback({
      preflight,
      dbClient: db,
    });

    // Build response from preflight + insert result to avoid post-insert re-fetch
    // under RLS (same user context should see the row, but avoids dependency on
    // visibility and gives consistent 201 semantics). Use preparedInput as the
    // canonical source so the returned object reflects normalized/validated values.
    const now = new Date();
    const { preparedInput } = preflight;
    return json(
      {
        id: created.id,
        topic: preparedInput.topic,
        skillLevel: preparedInput.skillLevel,
        weeklyHours: preparedInput.weeklyHours,
        learningStyle: preparedInput.learningStyle,
        visibility: 'private',
        origin: preparedInput.origin,
        createdAt: now.toISOString(),
        status: 'generating',
      },
      { status: 201, headers: generationRateLimitHeaders }
    );
  })
);
