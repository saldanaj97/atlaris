/**
 * Zod schema for `job_queue` payloads of type `plan_regeneration`.
 * Consumed by orchestration (`process.ts`) when a worker dequeues a job; `overrides`
 * merge with the stored plan (topic, dates, skill, etc.) for that run.
 */
import { z } from 'zod';
import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans';

export const planRegenerationJobPayloadSchema = z
  .object({
    planId: z.string().uuid(),
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

export type PlanRegenerationJobPayload = z.infer<
  typeof planRegenerationJobPayloadSchema
>;
