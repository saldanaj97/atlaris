import { DEFAULT_ATTEMPT_CAP } from '@/lib/ai/constants';
import { getCorrelationId } from '@/lib/api/context';
import { appEnv, attemptsEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import type { InferSelectModel } from 'drizzle-orm';
import { and, asc, count, eq, gte } from 'drizzle-orm';

import { isRetryableClassification } from '@/lib/ai/failures';
import type { ParsedModule } from '@/lib/ai/parser';
import type { GenerationInput, ProviderMetadata } from '@/lib/ai/provider';
import {
  recordAttemptFailure as trackAttemptFailure,
  recordAttemptSuccess as trackAttemptSuccess,
} from '@/lib/metrics/attempts';
import type { FailureClassification } from '@/lib/types/client';
import {
  aggregateNormalizationFlags,
  normalizeModuleMinutes,
  normalizeTaskMinutes,
} from '@/lib/utils/effort';
import { hashSha256 } from '@/lib/utils/hash';
import { truncateToLength } from '@/lib/utils/truncation';
import {
  NOTES_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from '@/lib/validation/learningPlans';

import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';

/** Validated attempt cap: always >= 1; invalid env falls back to DEFAULT_ATTEMPT_CAP. */
const ATTEMPT_CAP = (() => {
  const raw = attemptsEnv.cap;
  if (!Number.isFinite(raw) || raw <= 0 || Number.isNaN(raw)) {
    return DEFAULT_ATTEMPT_CAP;
  }
  return Math.floor(raw);
})();

/**
 * Db client for attempts. Must be request-scoped {@link getDb} in API routes to enforce RLS.
 *
 * When using the RLS client returned by {@link getDb}, callers are responsible for releasing
 * it by calling its `cleanup()` method. Do this in a `finally` block.
 *
 * When using RLS client, always call cleanup() in a finally block to release the database connection.
 */
export type AttemptsDbClient = ReturnType<
  typeof import('@/lib/db/runtime').getDb
>;

interface SanitizedField {
  value: string | undefined;
  truncated: boolean;
  originalLength?: number;
}

export interface SanitizedInput {
  topic: SanitizedField & { value: string; originalLength: number };
  notes: SanitizedField;
}

export interface AttemptPreparation {
  planId: string;
  userId: string;
  attemptNumber: number;
  capped: boolean;
  startedAt: Date;
  sanitized: SanitizedInput;
  promptHash: string;
}

export type GenerationAttemptRecord = InferSelectModel<
  typeof generationAttempts
>;

export interface StartAttemptParams {
  planId: string;
  userId: string;
  input: GenerationInput;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

export interface RecordSuccessParams {
  planId: string;
  preparation: AttemptPreparation;
  modules: ParsedModule[];
  providerMetadata?: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

export interface RecordFailureParams {
  planId: string;
  preparation: AttemptPreparation;
  classification: FailureClassification;
  durationMs: number;
  timedOut?: boolean;
  extendedTimeout?: boolean;
  providerMetadata?: ProviderMetadata;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Atomic reservation types (Phase 2 – concurrency-safe attempt cap)
// ---------------------------------------------------------------------------

export interface AttemptReservation {
  reserved: true;
  attemptId: string;
  attemptNumber: number;
  startedAt: Date;
  sanitized: SanitizedInput;
  promptHash: string;
}

export interface AttemptRejection {
  reserved: false;
  reason: 'capped' | 'in_progress';
}

export type ReserveAttemptResult = AttemptReservation | AttemptRejection;

export interface FinalizeSuccessParams {
  attemptId: string;
  planId: string;
  preparation: AttemptReservation;
  modules: ParsedModule[];
  providerMetadata?: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

export interface FinalizeFailureParams {
  attemptId: string;
  planId: string;
  preparation: AttemptReservation;
  classification: FailureClassification;
  durationMs: number;
  timedOut?: boolean;
  extendedTimeout?: boolean;
  providerMetadata?: ProviderMetadata;
  /**
   * Optional error that caused the failure.
   * When classification is 'provider_error', used to decide retryability
   * (e.g. 5xx/transient → retryable, 4xx/validation-like → terminal).
   */
  error?: unknown;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

/**
 * Determines if a provider_error is retryable based on error metadata.
 * 5xx or unknown → retryable; 4xx → terminal.
 */
function isProviderErrorRetryable(error: unknown): boolean {
  if (error == null) return true;
  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: number }).status
      : undefined;
  if (typeof status !== 'number' || !Number.isFinite(status)) return true;
  if (status >= 500) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}

function logAttemptEvent(
  event: 'success' | 'failure',
  payload: Record<string, unknown>
) {
  const correlationId = getCorrelationId();
  const enriched = {
    ...payload,
    correlationId: correlationId ?? null,
  } satisfies Record<string, unknown>;
  logger.info(
    {
      source: 'attempts',
      event,
      ...enriched,
    },
    `attempts_${event}`
  );

  // In test environments, emit a lightweight console log that integration tests can assert on.
  // This mirrors a human-readable log line without altering production logging behavior.
  if (appEnv.isTest) {
    // Example: "[attempts] success", { correlationId: '...', ...payload }
    // eslint-disable-next-line no-console
    console.info(`[attempts] ${event}`, enriched);
  }
}

interface MetadataParams {
  sanitized: SanitizedInput;
  providerMetadata?: ProviderMetadata;
  modulesClamped: boolean;
  tasksClamped: boolean;
  startedAt: Date;
  finishedAt: Date;
  extendedTimeout: boolean;
  failure?: { classification: FailureClassification; timedOut: boolean };
}

function buildMetadata(params: MetadataParams) {
  const {
    sanitized,
    providerMetadata,
    modulesClamped,
    tasksClamped,
    startedAt,
    finishedAt,
    extendedTimeout,
    failure,
  } = params;

  return {
    input: {
      topic: {
        truncated: sanitized.topic.truncated,
        original_length: sanitized.topic.originalLength,
      },
      notes:
        sanitized.notes.originalLength !== undefined
          ? {
              truncated: sanitized.notes.truncated,
              original_length: sanitized.notes.originalLength,
            }
          : null,
    },
    normalization: {
      modules_clamped: modulesClamped,
      tasks_clamped: tasksClamped,
    },
    timing: {
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(
        0,
        Math.round(finishedAt.getTime() - startedAt.getTime())
      ),
      extended_timeout: extendedTimeout,
    },
    provider: providerMetadata ?? null,
    failure: failure ?? null,
  } satisfies Record<string, unknown>;
}

function sanitizeInput(input: GenerationInput): SanitizedInput {
  const topicResult = truncateToLength(input.topic, TOPIC_MAX_LENGTH);
  if (topicResult.value === undefined) {
    throw new Error('Topic is required for generation attempts.');
  }

  const topicValue = topicResult.value;

  if (typeof topicValue !== 'string' || topicValue.trim().length === 0) {
    throw new Error('GenerationInput.topic must be a non-empty string.');
  }

  const notesResult = truncateToLength(
    input.notes ?? undefined,
    NOTES_MAX_LENGTH
  );

  return {
    topic: {
      value: topicValue,
      truncated: topicResult.truncated,
      originalLength: topicResult.originalLength ?? topicValue.length,
    },
    notes: {
      value: notesResult.value,
      truncated: notesResult.truncated,
      originalLength: notesResult.originalLength,
    },
  };
}

function toPromptHashPayload(
  planId: string,
  userId: string,
  input: GenerationInput,
  sanitized: SanitizedInput
) {
  return {
    planId,
    userId,
    topic: sanitized.topic.value,
    notes: sanitized.notes.value ?? null,
    skillLevel: input.skillLevel,
    weeklyHours: input.weeklyHours,
    learningStyle: input.learningStyle,
  } satisfies Record<string, unknown>;
}

function normalizeParsedModules(modulesInput: ParsedModule[]) {
  const moduleFlags = [] as ReturnType<typeof normalizeModuleMinutes>[];
  const taskFlags = [] as ReturnType<typeof normalizeTaskMinutes>[];

  const normalizedModules = modulesInput.map((module) => {
    const normalizedModule = normalizeModuleMinutes(module.estimatedMinutes);
    moduleFlags.push(normalizedModule);

    const normalizedTasks = module.tasks.map((task) => {
      const normalizedTask = normalizeTaskMinutes(task.estimatedMinutes);
      taskFlags.push(normalizedTask);
      return {
        title: task.title,
        description: task.description ?? null,
        estimatedMinutes: normalizedTask.value,
      };
    });

    return {
      title: module.title,
      description: module.description ?? null,
      estimatedMinutes: normalizedModule.value,
      tasks: normalizedTasks,
    };
  });

  const normalizationFlags = aggregateNormalizationFlags(
    moduleFlags,
    taskFlags
  );

  return { normalizedModules, normalizationFlags };
}

/**
 * @deprecated Use {@link reserveAttemptSlot} for atomic cap enforcement.
 * Retained for backward compatibility with existing tests.
 */
export async function startAttempt({
  planId,
  userId,
  input,
  dbClient,
  now,
}: StartAttemptParams): Promise<AttemptPreparation> {
  const client = dbClient;
  const nowFn = now ?? (() => new Date());

  const [planOwner] = await client
    .select({ userId: learningPlans.userId })
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!planOwner || planOwner.userId !== userId) {
    throw new Error('Learning plan not found or inaccessible for user');
  }

  const sanitized = sanitizeInput(input);
  const promptHash = hashSha256(
    JSON.stringify(toPromptHashPayload(planId, userId, input, sanitized))
  );

  const [{ value: existingAttempts = 0 } = { value: 0 }] = await client
    .select({ value: count(generationAttempts.id) })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId));

  const capped = existingAttempts >= ATTEMPT_CAP;

  return {
    planId,
    userId,
    attemptNumber: existingAttempts + 1,
    capped,
    startedAt: nowFn(),
    sanitized,
    promptHash,
  };
}

/**
 * @deprecated Use {@link finalizeAttemptSuccess} with atomic reservation flow.
 * Retained for backward compatibility with existing tests.
 */
export async function recordSuccess({
  planId,
  preparation,
  modules: parsedModules,
  providerMetadata,
  durationMs,
  extendedTimeout,
  dbClient,
  now,
}: RecordSuccessParams): Promise<GenerationAttemptRecord> {
  const client = dbClient;
  const nowFn = now ?? (() => new Date());

  const { normalizedModules, normalizationFlags } =
    normalizeParsedModules(parsedModules);

  const modulesCount = normalizedModules.length;
  const tasksCount = normalizedModules.reduce(
    (sum, module) => sum + module.tasks.length,
    0
  );

  const finishedAt = nowFn();

  const metadata = buildMetadata({
    sanitized: preparation.sanitized,
    providerMetadata,
    modulesClamped: normalizationFlags.modulesClamped,
    tasksClamped: normalizationFlags.tasksClamped,
    startedAt: preparation.startedAt,
    finishedAt,
    extendedTimeout,
  });

  const insertedAttempt = await client.transaction(async (tx) => {
    await tx.delete(modules).where(eq(modules.planId, planId));

    const insertedModules = [] as Array<{
      id: string;
      tasks: {
        title: string;
        description: string | null;
        estimatedMinutes: number;
      }[];
    }>;

    // Bulk insert modules
    const moduleValues = normalizedModules.map((normalizedModule, index) => ({
      planId,
      order: index + 1,
      title: normalizedModule.title,
      description: normalizedModule.description,
      estimatedMinutes: normalizedModule.estimatedMinutes,
    }));
    const insertedModuleRows = await tx
      .insert(modules)
      .values(moduleValues)
      .returning({ id: modules.id });

    if (insertedModuleRows.length !== normalizedModules.length) {
      throw new Error('Failed to insert all modules for generation attempt.');
    }

    for (let i = 0; i < insertedModuleRows.length; i++) {
      insertedModules.push({
        id: insertedModuleRows[i].id,
        tasks: normalizedModules[i].tasks,
      });
    }

    for (const moduleEntry of insertedModules) {
      if (moduleEntry.tasks.length === 0) continue;
      await tx.insert(tasks).values(
        moduleEntry.tasks.map((task, taskIndex) => ({
          moduleId: moduleEntry.id,
          order: taskIndex + 1,
          title: task.title,
          description: task.description,
          estimatedMinutes: task.estimatedMinutes,
        }))
      );
    }

    const [attempt] = await tx
      .insert(generationAttempts)
      .values({
        planId,
        status: 'success',
        classification: null,
        durationMs: Math.max(0, Math.round(durationMs)),
        modulesCount,
        tasksCount,
        truncatedTopic: preparation.sanitized.topic.truncated,
        truncatedNotes: preparation.sanitized.notes.truncated ?? false,
        normalizedEffort:
          normalizationFlags.modulesClamped || normalizationFlags.tasksClamped,
        promptHash: preparation.promptHash,
        metadata,
      })
      .returning();

    if (!attempt) {
      throw new Error('Failed to record generation attempt.');
    }

    return attempt;
  });

  trackAttemptSuccess(insertedAttempt);

  logAttemptEvent('success', {
    planId,
    attemptId: insertedAttempt.id,
    durationMs: insertedAttempt.durationMs,
    modulesCount,
    tasksCount,
  });

  return insertedAttempt;
}

/**
 * @deprecated Use {@link finalizeAttemptFailure} with atomic reservation flow.
 * Retained for backward compatibility with existing tests.
 */
export async function recordFailure({
  planId,
  preparation,
  classification,
  durationMs,
  timedOut = false,
  extendedTimeout = false,
  providerMetadata,
  dbClient,
  now,
}: RecordFailureParams): Promise<GenerationAttemptRecord> {
  const client = dbClient;
  const nowFn = now ?? (() => new Date());
  const finishedAt = nowFn();

  const metadata = buildMetadata({
    sanitized: preparation.sanitized,
    providerMetadata,
    modulesClamped: false,
    tasksClamped: false,
    startedAt: preparation.startedAt,
    finishedAt,
    extendedTimeout,
    failure: { classification, timedOut },
  });

  const [attempt] = await client
    .insert(generationAttempts)
    .values({
      planId,
      status: 'failure',
      classification,
      durationMs: Math.max(0, Math.round(durationMs)),
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: preparation.sanitized.topic.truncated,
      truncatedNotes: preparation.sanitized.notes.truncated ?? false,
      normalizedEffort: false,
      promptHash: preparation.promptHash,
      metadata,
    })
    .returning();

  if (!attempt) {
    throw new Error('Failed to record failed generation attempt.');
  }

  trackAttemptFailure(attempt);

  logAttemptEvent('failure', {
    planId,
    attemptId: attempt.id,
    classification,
    durationMs: attempt.durationMs,
    timedOut,
    extendedTimeout,
  });

  return attempt;
}

// ---------------------------------------------------------------------------
// Atomic reservation flow (Phase 2 – concurrency-safe attempt cap)
// ---------------------------------------------------------------------------

/**
 * Atomically reserves an attempt slot for a plan within a single transaction.
 *
 * 1. Locks the plan row with FOR UPDATE to prevent concurrent reservations.
 * 2. Verifies ownership and counts existing attempts (cap enforcement).
 * 3. Rejects if an in-progress attempt already exists for the plan.
 * 4. Inserts a placeholder attempt with status 'in_progress'.
 * 5. Sets the plan's generation_status to 'generating'.
 *
 * @returns AttemptReservation on success, AttemptRejection with reason on rejection.
 */
export async function reserveAttemptSlot(params: {
  planId: string;
  userId: string;
  input: GenerationInput;
  dbClient: AttemptsDbClient;
  now?: () => Date;
}): Promise<ReserveAttemptResult> {
  const { planId, userId, input, dbClient } = params;
  const nowFn = params.now ?? (() => new Date());

  const sanitized = sanitizeInput(input);
  const promptHash = hashSha256(
    JSON.stringify(toPromptHashPayload(planId, userId, input, sanitized))
  );

  return dbClient.transaction(async (tx) => {
    // Lock the plan row to serialize concurrent reservation attempts
    const [plan] = await tx
      .select({
        id: learningPlans.id,
        userId: learningPlans.userId,
      })
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .for('update');

    if (!plan || plan.userId !== userId) {
      throw new Error('Learning plan not found or inaccessible for user');
    }

    // Count ALL existing attempts (including any lingering in_progress ones)
    const [{ value: existingAttempts = 0 } = { value: 0 }] = await tx
      .select({ value: count(generationAttempts.id) })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));

    if (existingAttempts >= ATTEMPT_CAP) {
      return { reserved: false, reason: 'capped' } as const;
    }

    // Reject if another attempt is already in-progress for this plan
    const [inProgressAttempt] = await tx
      .select({ id: generationAttempts.id })
      .from(generationAttempts)
      .where(
        and(
          eq(generationAttempts.planId, planId),
          eq(generationAttempts.status, 'in_progress')
        )
      )
      .limit(1);

    if (inProgressAttempt) {
      return { reserved: false, reason: 'in_progress' } as const;
    }

    const startedAt = nowFn();

    // Insert a placeholder attempt record
    const [attempt] = await tx
      .insert(generationAttempts)
      .values({
        planId,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: sanitized.topic.truncated,
        truncatedNotes: sanitized.notes.truncated ?? false,
        normalizedEffort: false,
        promptHash,
        metadata: null,
      })
      .returning();

    if (!attempt) {
      throw new Error('Failed to reserve generation attempt slot.');
    }

    // Transition plan to 'generating' (idempotent if already generating)
    await tx
      .update(learningPlans)
      .set({
        generationStatus: 'generating',
        updatedAt: startedAt,
      })
      .where(eq(learningPlans.id, planId));

    return {
      reserved: true,
      attemptId: attempt.id,
      attemptNumber: existingAttempts + 1,
      startedAt,
      sanitized,
      promptHash,
    } as const;
  });
}

/**
 * Finalizes a previously reserved attempt as successful.
 * Updates the in-progress attempt row, replaces plan modules/tasks,
 * and records metrics — all within a single transaction.
 */
export async function finalizeAttemptSuccess({
  attemptId,
  planId,
  preparation,
  modules: parsedModules,
  providerMetadata,
  durationMs,
  extendedTimeout,
  dbClient,
  now,
}: FinalizeSuccessParams): Promise<GenerationAttemptRecord> {
  assertAttemptIdMatchesReservation(attemptId, preparation);

  const nowFn = now ?? (() => new Date());

  const { normalizedModules, normalizationFlags } =
    normalizeParsedModules(parsedModules);

  const modulesCount = normalizedModules.length;
  const tasksCount = normalizedModules.reduce(
    (sum, module) => sum + module.tasks.length,
    0
  );

  const finishedAt = nowFn();

  const metadata = buildMetadata({
    sanitized: preparation.sanitized,
    providerMetadata,
    modulesClamped: normalizationFlags.modulesClamped,
    tasksClamped: normalizationFlags.tasksClamped,
    startedAt: preparation.startedAt,
    finishedAt,
    extendedTimeout,
  });

  const updatedAttempt = await dbClient.transaction(async (tx) => {
    // Replace existing modules for the plan
    await tx.delete(modules).where(eq(modules.planId, planId));

    // Bulk insert modules
    const moduleValues = normalizedModules.map((normalizedModule, index) => ({
      planId,
      order: index + 1,
      title: normalizedModule.title,
      description: normalizedModule.description,
      estimatedMinutes: normalizedModule.estimatedMinutes,
    }));
    const insertedModuleRows =
      moduleValues.length > 0
        ? await tx
            .insert(modules)
            .values(moduleValues)
            .returning({ id: modules.id })
        : [];

    if (insertedModuleRows.length !== normalizedModules.length) {
      throw new Error('Failed to insert all modules for generation attempt.');
    }

    // Bulk insert tasks across all modules in one statement.
    const taskValues: Array<{
      moduleId: string;
      order: number;
      title: string;
      description: string | null;
      estimatedMinutes: number;
    }> = [];

    for (let i = 0; i < insertedModuleRows.length; i++) {
      const moduleRow = insertedModuleRows[i];
      const moduleEntry = normalizedModules[i];

      if (!moduleRow || !moduleEntry) {
        throw new Error('Failed to map inserted modules to generated tasks.');
      }

      for (
        let taskIndex = 0;
        taskIndex < moduleEntry.tasks.length;
        taskIndex++
      ) {
        const task = moduleEntry.tasks[taskIndex];
        if (!task) {
          throw new Error('Failed to map generated task for insertion.');
        }

        taskValues.push({
          moduleId: moduleRow.id,
          order: taskIndex + 1,
          title: task.title,
          description: task.description,
          estimatedMinutes: task.estimatedMinutes,
        });
      }
    }

    if (taskValues.length > 0) {
      await tx.insert(tasks).values(taskValues);
    }

    // Finalize the reserved attempt record
    const [attempt] = await tx
      .update(generationAttempts)
      .set({
        status: 'success',
        classification: null,
        durationMs: Math.max(0, Math.round(durationMs)),
        modulesCount,
        tasksCount,
        truncatedTopic: preparation.sanitized.topic.truncated,
        truncatedNotes: preparation.sanitized.notes.truncated ?? false,
        normalizedEffort:
          normalizationFlags.modulesClamped || normalizationFlags.tasksClamped,
        metadata,
      })
      .where(eq(generationAttempts.id, attemptId))
      .returning();

    if (!attempt) {
      throw new Error('Failed to finalize generation attempt as success.');
    }

    // Keep plan status and attempt finalization atomic.
    await tx
      .update(learningPlans)
      .set({
        generationStatus: 'ready',
        isQuotaEligible: true,
        finalizedAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(learningPlans.id, planId));

    return attempt;
  });

  trackAttemptSuccess(updatedAttempt);

  logAttemptEvent('success', {
    planId,
    attemptId: updatedAttempt.id,
    durationMs: updatedAttempt.durationMs,
    modulesCount,
    tasksCount,
  });

  return updatedAttempt;
}

/**
 * Finalizes a previously reserved attempt as failed.
 * Updates the in-progress attempt row and plan status in one transaction, then records metrics.
 */
export async function finalizeAttemptFailure({
  attemptId,
  planId,
  preparation,
  classification,
  durationMs,
  timedOut = false,
  extendedTimeout = false,
  providerMetadata,
  error,
  dbClient,
  now,
}: FinalizeFailureParams): Promise<GenerationAttemptRecord> {
  assertAttemptIdMatchesReservation(attemptId, preparation);

  const nowFn = now ?? (() => new Date());
  const finishedAt = nowFn();

  const metadata = buildMetadata({
    sanitized: preparation.sanitized,
    providerMetadata,
    modulesClamped: false,
    tasksClamped: false,
    startedAt: preparation.startedAt,
    finishedAt,
    extendedTimeout,
    failure: { classification, timedOut },
  });

  const attempt = await dbClient.transaction(async (tx) => {
    const [updatedAttempt] = await tx
      .update(generationAttempts)
      .set({
        status: 'failure',
        classification,
        durationMs: Math.max(0, Math.round(durationMs)),
        modulesCount: 0,
        tasksCount: 0,
        normalizedEffort: false,
        metadata,
      })
      .where(eq(generationAttempts.id, attemptId))
      .returning();

    if (!updatedAttempt) {
      throw new Error('Failed to finalize generation attempt as failure.');
    }

    // Only transition plan to failed when terminal or at attempt cap.
    // Retryable failures (rate_limit, timeout) with attempts < cap keep plan as generating.
    // For provider_error: use error metadata (HTTP status) to decide retryability.
    const effectiveRetryable =
      classification === 'provider_error'
        ? isProviderErrorRetryable(error)
        : isRetryableClassification(classification);
    const isTerminal =
      !effectiveRetryable || preparation.attemptNumber >= ATTEMPT_CAP;

    if (isTerminal) {
      await tx
        .update(learningPlans)
        .set({
          generationStatus: 'failed',
          isQuotaEligible: false,
          updatedAt: finishedAt,
        })
        .where(eq(learningPlans.id, planId));
    } else {
      await tx
        .update(learningPlans)
        .set({ updatedAt: finishedAt })
        .where(eq(learningPlans.id, planId));
    }

    return updatedAttempt;
  });

  trackAttemptFailure(attempt);

  logAttemptEvent('failure', {
    planId,
    attemptId: attempt.id,
    classification,
    durationMs: attempt.durationMs,
    timedOut,
    extendedTimeout,
  });

  return attempt;
}

export { ATTEMPT_CAP };

function assertAttemptIdMatchesReservation(
  attemptId: string,
  preparation: AttemptReservation
): void {
  if (attemptId !== preparation.attemptId) {
    throw new Error('Attempt ID mismatch between params and reserved attempt.');
  }
}

/**
 * Counts generation attempts for the given user since the given timestamp.
 * Joins with learning_plans to enforce ownership by ownerId (user id).
 *
 * @param userId - Internal user id (from users table) to enforce per-user limit
 * @param dbClient - Database client for querying generation_attempts
 * @param since - Start of the time window
 * @returns Number of generation attempts in the window
 */
export async function countUserGenerationAttemptsSince(
  userId: string,
  dbClient: AttemptsDbClient,
  since: Date
): Promise<number> {
  const [row] = await dbClient
    .select({ value: count(generationAttempts.id) })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(
      and(
        eq(learningPlans.userId, userId),
        gte(generationAttempts.createdAt, since)
      )
    );

  return row?.value ?? 0;
}

/**
 * Returns the createdAt timestamp of the oldest generation attempt for the user
 * within the given window. Used to compute accurate retry-after when rate limit
 * is exceeded (the oldest attempt determines when the window will free a slot).
 *
 * @param userId - Internal user id (from users table)
 * @param dbClient - Database client for querying generation_attempts
 * @param since - Start of the time window
 * @returns The createdAt of the oldest attempt, or null if none exist
 */
export async function getOldestUserGenerationAttemptSince(
  userId: string,
  dbClient: AttemptsDbClient,
  since: Date
): Promise<Date | null> {
  const [row] = await dbClient
    .select({ createdAt: generationAttempts.createdAt })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(
      and(
        eq(learningPlans.userId, userId),
        gte(generationAttempts.createdAt, since)
      )
    )
    .orderBy(asc(generationAttempts.createdAt))
    .limit(1);

  return row?.createdAt ?? null;
}
