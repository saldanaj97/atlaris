import { z } from 'zod';

export const WorkflowSdkMetadataSchema = z.strictObject({
  provider: z.literal('workflow-sdk'),
  runId: z.string().min(1).max(256),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
});

export type WorkflowSdkMetadata = z.infer<typeof WorkflowSdkMetadataSchema>;

/**
 * Regeneration run executed by the Cloudflare jobs Worker's queue consumer.
 * `runId` is the queue message ID (docs/architecture/regeneration-worker-runbook.md).
 */
export const CloudflareQueueRunMetadataSchema = z.strictObject({
  provider: z.literal('cloudflare-queue'),
  runId: z.string().min(1).max(256),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
});

export type CloudflareQueueRunMetadata = z.infer<
  typeof CloudflareQueueRunMetadataSchema
>;

/**
 * Run executed as a Cloudflare Workflow on the jobs Worker. `runId` is the
 * Workflow instance ID (docs/architecture/cloudflare-jobs-runtime.md, Decision 4).
 */
export const CloudflareWorkflowRunMetadataSchema = z.strictObject({
  provider: z.literal('cloudflare-workflow'),
  runId: z.string().min(1).max(256),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
});

export type CloudflareWorkflowRunMetadata = z.infer<
  typeof CloudflareWorkflowRunMetadataSchema
>;

/** `job_queue.payload.workflow`: which runtime owns the regeneration run. */
export const JobRunMetadataSchema = z.discriminatedUnion('provider', [
  WorkflowSdkMetadataSchema,
  CloudflareQueueRunMetadataSchema,
]);

export type JobRunMetadata = z.infer<typeof JobRunMetadataSchema>;
