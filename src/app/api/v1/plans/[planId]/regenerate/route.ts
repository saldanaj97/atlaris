import { ZodError } from 'zod';

import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { json, jsonError } from '@/lib/api/response';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { enqueueJob } from '@/lib/jobs/queue';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/lib/jobs/types';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';
import { resolveUserTier } from '@/lib/stripe/usage';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  weeklyHoursSchema,
} from '@/lib/validation/learningPlans';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

function getPlanId(req: Request): string {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // segments: ['api', 'v1', 'plans', '{planId}', 'regenerate']
  return segments[segments.length - 2];
}

const overridesSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(3, 'topic must be at least 3 characters long.')
      .max(
        TOPIC_MAX_LENGTH,
        `topic must be ${TOPIC_MAX_LENGTH} characters or fewer.`
      )
      .optional(),
    notes: z
      .string()
      .trim()
      .max(
        NOTES_MAX_LENGTH,
        `notes must be ${NOTES_MAX_LENGTH} characters or fewer.`
      )
      .optional()
      .nullable()
      .transform((value) => {
        if (value === null || value === undefined) {
          return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }),
    skillLevel: z
      .enum(['beginner', 'intermediate', 'advanced'] as const)
      .optional(),
    weeklyHours: weeklyHoursSchema.optional(),
    learningStyle: z
      .enum(['reading', 'video', 'practice', 'mixed'] as const)
      .optional(),
    startDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        'Start date must be a valid ISO date string.'
      )
      .transform((value) => (value ? value : null)),
    deadlineDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        'Deadline date must be a valid ISO date string.'
      )
      .transform((value) => (value ? value : null)),
  })
  .strict();

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const planId = getPlanId(req);
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      return jsonError('User not found', { status: 404 });
    }

    // Fetch and verify plan ownership
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan || plan.userId !== user.id) {
      return jsonError('Plan not found', { status: 404 });
    }

    // Parse request body for overrides
    let body: { overrides?: unknown } = {};
    try {
      body = (await req.json().catch(() => ({}))) as {
        overrides?: unknown;
      };
    } catch {
      throw new ValidationError('Invalid request body.');
    }

    let overrides: z.infer<typeof overridesSchema> | undefined;
    if (body.overrides !== undefined) {
      try {
        overrides = overridesSchema.parse(body.overrides);
      } catch (error) {
        if (error instanceof ZodError) {
          throw new ValidationError('Invalid overrides.', error.flatten());
        }
        throw new ValidationError('Invalid overrides.', error);
      }
    }

    // Compute priority based on tier and topic
    const tier = await resolveUserTier(user.id);
    const priority = computeJobPriority({
      tier,
      isPriorityTopic: isPriorityTopic(overrides?.topic ?? plan.topic),
    });

    // Enqueue regeneration job
    const payload: PlanRegenerationJobData = { planId, overrides };
    await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION,
      planId,
      user.id,
      payload,
      priority
    );

    return json(
      { generationId: planId, planId, status: 'pending' },
      { status: 202 }
    );
  })
);
