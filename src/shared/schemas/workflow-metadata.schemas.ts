import { z } from 'zod';

export const WorkflowSdkMetadataSchema = z.strictObject({
  provider: z.literal('workflow-sdk'),
  runId: z.string().min(1).max(256),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
});

export type WorkflowSdkMetadata = z.infer<typeof WorkflowSdkMetadataSchema>;
