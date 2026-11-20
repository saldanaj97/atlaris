/**
 * App ↔ jobs Worker command contract (docs/architecture/cloudflare-jobs-runtime.md,
 * Decision 4). Shared by the app's signed client and the Worker's verifier, so
 * both sides sign the same canonical string. Web Crypto only: runs on Node and
 * workerd.
 */
import type { PlanGenerationWorkflowInput } from '@/features/plans/contracts/plan-generation.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

import { LEARNING_STYLES, SKILL_LEVELS } from '@/shared/types/db';
import { generationStatus } from '@supabase/enums';
import { z } from 'zod';

export const JOBS_TIMESTAMP_HEADER = 'x-atlaris-jobs-timestamp';
export const JOBS_SIGNATURE_HEADER = 'x-atlaris-jobs-signature';
export const JOBS_SIGNATURE_VERSION = 'v1';
export const JOBS_SIGNATURE_MAX_SKEW_SECONDS = 300;
export const JOBS_SIGNED_BODY_MAX_BYTES = 256 * 1024;

export const JOBS_COMMAND_PATHS = {
  regenerationEnqueue: '/v1/regeneration/enqueue',
  moduleLessonsStart: '/v1/module-lessons/start',
  planGenerationStart: '/v1/plan-generation/start',
  emailDeliveryRuns: '/v1/email-delivery/runs',
} as const;

export const regenerationEnqueueCommandSchema = z.object({
  v: z.literal(1),
  jobId: z.uuid(),
});

export type RegenerationEnqueueCommand = z.infer<
  typeof regenerationEnqueueCommandSchema
>;

/**
 * `POST /v1/module-lessons/start` body; also the module lessons Workflow
 * params. `batchRequestId` matches the app's provisional claim, which the
 * Workflow adopts. `correlationId` may come from a request header.
 */
export const moduleLessonsStartCommandSchema = z.strictObject({
  v: z.literal(1),
  planId: z.uuid(),
  moduleId: z.uuid(),
  userId: z.uuid(),
  batchRequestId: z.string().min(1).max(128),
  correlationId: z.string().min(1).max(256),
  modelOverride: z.string().min(1).max(256).optional(),
});

export type ModuleLessonsStartCommand = z.infer<
  typeof moduleLessonsStartCommandSchema
>;

const subscriptionTierSchema = z.enum([
  'free',
  'starter',
  'pro',
]) satisfies z.ZodType<SubscriptionTier>;

const planGenerationStatusSchema = z.enum(generationStatus.enumValues);

const initialGenerationPurposeSchema = z.literal(
  'initial',
) satisfies z.ZodType<GenerationPurpose>;

/**
 * `SerializableAttemptReservation` as JSON carries it: `undefined` notes
 * fields are dropped on the wire and restored as `undefined` keys here.
 */
const serializableReservationSchema = z.strictObject({
  attemptId: z.uuid(),
  attemptNumber: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  admittedTier: subscriptionTierSchema.optional(),
  promptHash: z.string().min(1),
  sanitized: z.strictObject({
    topic: z.strictObject({
      value: z.string(),
      truncated: z.boolean(),
      originalLength: z.number().int().nonnegative(),
    }),
    notes: z
      .strictObject({
        value: z.string().optional(),
        truncated: z.boolean(),
        originalLength: z.number().int().nonnegative().optional(),
      })
      .transform((notes) => ({
        value: notes.value,
        truncated: notes.truncated,
        originalLength: notes.originalLength,
      })),
  }),
  generationPurpose: initialGenerationPurposeSchema.optional(),
});

/**
 * `POST /v1/plan-generation/start` body; also the plan-generation Workflow
 * params. Everything besides `v` is the app's `PlanGenerationWorkflowInput`
 * (`toPlanGenerationWorkflowInput` checks the two stay in step). The instance
 * ID comes from `reservation.attemptId`.
 */
export const planGenerationStartCommandSchema = z.strictObject({
  v: z.literal(1),
  planId: z.uuid(),
  userId: z.uuid(),
  tier: subscriptionTierSchema,
  input: z.strictObject({
    topic: z.string().min(1),
    notes: z.string().nullable().optional(),
    skillLevel: z.enum(SKILL_LEVELS),
    weeklyHours: z.number(),
    learningStyle: z.enum(LEARNING_STYLES),
    startDate: z.string().nullable().optional(),
    deadlineDate: z.string().nullable().optional(),
  }),
  generationPurpose: initialGenerationPurposeSchema.optional(),
  modelOverride: z.string().min(1).max(256).nullable().optional(),
  groundedWriterModelId: z.string().min(1).max(256).nullable().optional(),
  correlationId: z.string().min(1).max(256),
  reservation: serializableReservationSchema,
  allowedGenerationStatuses: z.array(planGenerationStatusSchema).optional(),
  requiredGenerationStatus: planGenerationStatusSchema.optional(),
});

export type PlanGenerationStartCommand = z.infer<
  typeof planGenerationStartCommandSchema
>;

export function toPlanGenerationWorkflowInput(
  command: PlanGenerationStartCommand,
): PlanGenerationWorkflowInput {
  const { v: _version, ...input } = command;
  return input;
}

export type JobsUnavailableCode = 'jobs_paused' | 'job_disabled';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function hashJobsBody(body: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
}

export async function computeJobsSignatureFromBodyHash(input: {
  readonly secret: string;
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly bodyHash: string;
}): Promise<string> {
  const canonical = `${input.timestamp}.${input.method.toUpperCase()}.${input.path}.${input.bodyHash}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(
    await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)),
  );
}

/**
 * Hex HMAC-SHA256 over `<timestamp>.<METHOD>.<path>.<hex sha256(body)>`.
 * Returns the bare hex digest; the header value is `v1=<hex>`.
 */
export async function computeJobsSignature(input: {
  readonly secret: string;
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly body: string;
}): Promise<string> {
  const { body, ...rest } = input;
  return computeJobsSignatureFromBodyHash({
    ...rest,
    bodyHash: await hashJobsBody(body),
  });
}

export async function jobsSignaturesMatch(
  expected: string,
  provided: string,
): Promise<boolean> {
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
  ]);
  const a = new Uint8Array(expectedHash);
  const b = new Uint8Array(providedHash);

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index]! ^ b[index]!;
  }
  return mismatch === 0;
}
