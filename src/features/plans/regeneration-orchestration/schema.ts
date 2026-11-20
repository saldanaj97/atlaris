import {
  regenerationNoteSchema,
  regenerationReasonsSchema,
} from '@/features/plans/regeneration-orchestration/reasons';
import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans';
import { JobRunMetadataSchema } from '@/shared/schemas/workflow-metadata.schemas';
import { z } from 'zod';

const jobErrorHistoryEntrySchema = z.strictObject({
  attempt: z.number(),
  error: z.string(),
  timestamp: z.string(),
});

export const planRegenerationJobPayloadSchema = z.strictObject({
  planId: z.uuid(),
  workflow: JobRunMetadataSchema.optional(),
  overrides: planRegenerationOverridesSchema.optional(),
  reasons: regenerationReasonsSchema.optional(),
  note: regenerationNoteSchema.min(1).optional(),
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
