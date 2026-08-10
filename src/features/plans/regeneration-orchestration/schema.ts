import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans';
import { WorkflowSdkMetadataSchema } from '@/shared/schemas/workflow-metadata.schemas';
/**
 * Zod schema for `job_queue` payloads of type `plan_regeneration`.
 * Consumed by orchestration (`process.ts`) when a worker dequeues a job; `overrides`
 * merge with the stored plan (topic, dates, skill, etc.) for that run.
 */
import { z } from 'zod';

export const planRegenerationJobPayloadSchema = z.strictObject({
  planId: z.uuid(),
  workflow: WorkflowSdkMetadataSchema.optional(),
  overrides: planRegenerationOverridesSchema.optional(),
});

export type PlanRegenerationJobPayload = z.infer<
  typeof planRegenerationJobPayloadSchema
>;
