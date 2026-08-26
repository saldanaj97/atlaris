import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans';
import { WorkflowSdkMetadataSchema } from '@/shared/schemas/workflow-metadata.schemas';
/**
 * Zod schema for `job_queue` payloads of type `plan_regeneration`.
 * Consumed by orchestration (`process.ts`) when a worker dequeues a job; allowed
 * `overrides` merge with the stored plan (dates, skill, hours, style, model).
 * Topic/notes are never taken from the payload — they are rebuilt from the plan.
 */
import { z } from 'zod';

const jobErrorHistoryEntrySchema = z.strictObject({
  attempt: z.number(),
  error: z.string(),
  timestamp: z.string(),
});

export const planRegenerationJobPayloadSchema = z.strictObject({
  planId: z.uuid(),
  workflow: WorkflowSdkMetadataSchema.optional(),
  overrides: planRegenerationOverridesSchema.optional(),
  quota: z
    .strictObject({
      providerStartedAt: z.iso.datetime(),
    })
    .optional(),
  errorHistory: z.array(jobErrorHistoryEntrySchema).optional(),
});

export type PlanRegenerationJobPayload = z.infer<
  typeof planRegenerationJobPayloadSchema
>;
