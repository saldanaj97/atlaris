import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans';
/**
 * Zod schema for `job_queue` payloads of type `plan_regeneration`.
 * Consumed by orchestration (`process.ts`) when a worker dequeues a job; `overrides`
 * merge with the stored plan (topic, dates, skill, etc.) for that run.
 */
import { z } from 'zod';

const planRegenerationWorkflowMetadataSchema = z
  .object({
    provider: z.literal('workflow-sdk'),
    runId: z.string().min(1).max(256),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export const planRegenerationJobPayloadSchema = z
  .object({
    planId: z.string().uuid(),
    workflow: planRegenerationWorkflowMetadataSchema.optional(),
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

export type PlanRegenerationJobPayload = z.infer<
  typeof planRegenerationJobPayloadSchema
>;
