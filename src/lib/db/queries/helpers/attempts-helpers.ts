import { PLAN_GENERATION_WINDOW_MS } from '@/lib/ai/generation-policy';
import { getCorrelationId } from '@/lib/api/context';
import { appEnv } from '@/lib/config/env';
import type {
  AttemptError,
  AttemptMetadata,
  AttemptReservation,
  AttemptsDbClient,
  FinalizeSuccessPersistenceParams,
  GenerationAttemptRecord,
  MetadataParams,
  NormalizedModuleData,
  NormalizedModulesResult,
  PdfProvenanceData,
  SanitizedInput,
  UserGenerationAttemptsSinceParams,
} from '@/lib/db/queries/types/attempts.types';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
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
import { and, asc, count, eq, gte } from 'drizzle-orm';

import type { ParsedModule } from '@/lib/ai/parser';
import type { GenerationInput } from '@/lib/ai/types/provider.types';

/** Drizzle-like methods required by attempt operations (reserve, finalize). */
const ATTEMPTS_DB_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'transaction',
] as const;

/**
 * Type guard for AttemptsDbClient. Use when accepting db from unknown (e.g. options bags)
 * to fail fast with a clear error instead of obscure Drizzle errors later.
 */
export function isAttemptsDbClient(db: unknown): db is AttemptsDbClient {
  if (db == null || typeof db !== 'object') {
    return false;
  }
  const obj = db as Record<string, unknown>;
  return ATTEMPTS_DB_METHODS.every(
    (method) => typeof obj[method] === 'function'
  );
}

export function getProviderErrorStatus(
  attemptErr: AttemptError | null | undefined
): number | undefined {
  if (!attemptErr) return undefined;

  const responseStatus =
    'response' in attemptErr &&
    typeof attemptErr.response === 'object' &&
    attemptErr.response !== null &&
    'status' in attemptErr.response &&
    typeof attemptErr.response.status === 'number' &&
    Number.isFinite(attemptErr.response.status)
      ? attemptErr.response.status
      : undefined;

  const candidates = [
    'status' in attemptErr ? attemptErr.status : undefined,
    'statusCode' in attemptErr ? attemptErr.statusCode : undefined,
    'httpStatus' in attemptErr ? attemptErr.httpStatus : undefined,
    responseStatus,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function isProviderErrorRetryable(
  attemptErr: AttemptError | null | undefined
): boolean {
  if (attemptErr == null) return true;
  const status = getProviderErrorStatus(attemptErr);
  if (status === undefined) return true;
  if (status >= 500) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}

export function logAttemptEvent(
  event: 'success' | 'failure',
  payload: Record<string, unknown>
): void {
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

  if (appEnv.isTest) {
    // eslint-disable-next-line no-console
    console.info(`[attempts] ${event}`, enriched);
  }
}

export function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

export function getPdfContextDigest(input: GenerationInput): string | null {
  if (!input.pdfContext) {
    return null;
  }

  return hashSha256(stableSerialize(input.pdfContext));
}

export function hasPdfProvenanceInput(
  input: GenerationInput
): input is GenerationInput & {
  pdfContext: NonNullable<GenerationInput['pdfContext']>;
  pdfExtractionHash: string;
  pdfProofVersion?: 1;
} {
  return (
    input.pdfContext !== undefined &&
    input.pdfContext !== null &&
    typeof input.pdfExtractionHash === 'string' &&
    input.pdfExtractionHash !== ''
  );
}

export function getPdfProvenance(
  input: GenerationInput
): PdfProvenanceData | null {
  if (!hasPdfProvenanceInput(input)) {
    return null;
  }

  const contextDigest = getPdfContextDigest(input);
  if (!contextDigest) {
    return null;
  }

  return {
    extractionHash: input.pdfExtractionHash,
    proofVersion: input.pdfProofVersion ?? 1,
    contextDigest,
  };
}

export function buildMetadata(params: MetadataParams): AttemptMetadata {
  const {
    sanitized,
    providerMetadata,
    modulesClamped,
    tasksClamped,
    startedAt,
    finishedAt,
    extendedTimeout,
    pdfProvenance,
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
    pdf: pdfProvenance
      ? {
          extraction_hash: pdfProvenance.extractionHash,
          proof_version: pdfProvenance.proofVersion,
          context_digest: pdfProvenance.contextDigest,
        }
      : null,
    provider: providerMetadata ?? null,
    failure: failure ?? null,
  };
}

export function sanitizeInput(input: GenerationInput): SanitizedInput {
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

export function toPromptHashPayload(
  planId: string,
  userId: string,
  input: GenerationInput,
  sanitized: SanitizedInput
): Record<string, unknown> {
  const pdfContextDigest = getPdfContextDigest(input);

  return {
    planId,
    userId,
    topic: sanitized.topic.value,
    notes: sanitized.notes.value ?? null,
    skillLevel: input.skillLevel,
    weeklyHours: input.weeklyHours,
    learningStyle: input.learningStyle,
    pdfExtractionHash: input.pdfExtractionHash ?? null,
    pdfProofVersion: input.pdfProofVersion ?? null,
    pdfContextDigest,
  } satisfies Record<string, unknown>;
}

export function normalizeParsedModules(
  modulesInput: ParsedModule[]
): NormalizedModulesResult {
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

export function userAttemptsSincePredicate(userId: string, since: Date) {
  return and(
    eq(learningPlans.userId, userId),
    gte(generationAttempts.createdAt, since)
  );
}

export async function selectUserGenerationAttemptsSince({
  userId,
  dbClient,
  since,
}: UserGenerationAttemptsSinceParams): Promise<number> {
  const [row] = await dbClient
    .select({ value: count(generationAttempts.id) })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(userAttemptsSincePredicate(userId, since));

  return row?.value ?? 0;
}

export async function selectOldestUserGenerationAttemptSince({
  userId,
  dbClient,
  since,
}: UserGenerationAttemptsSinceParams): Promise<Date | null> {
  const [row] = await dbClient
    .select({ createdAt: generationAttempts.createdAt })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(userAttemptsSincePredicate(userId, since))
    .orderBy(asc(generationAttempts.createdAt))
    .limit(1);

  return row?.createdAt ?? null;
}

export function computeRetryAfterSeconds(
  oldestAttemptCreatedAt: Date | null,
  now: Date
): number {
  if (!oldestAttemptCreatedAt) {
    return Math.floor(PLAN_GENERATION_WINDOW_MS / 1000);
  }

  return Math.max(
    0,
    Math.floor(
      (oldestAttemptCreatedAt.getTime() +
        PLAN_GENERATION_WINDOW_MS -
        now.getTime()) /
        1000
    )
  );
}

export function assertAttemptIdMatchesReservation(
  attemptId: string,
  preparation: AttemptReservation
): void {
  if (attemptId !== preparation.attemptId) {
    throw new Error('Attempt ID mismatch between params and reserved attempt.');
  }
}

export async function persistSuccessfulAttempt(
  params: FinalizeSuccessPersistenceParams
): Promise<GenerationAttemptRecord> {
  const {
    attemptId,
    planId,
    preparation,
    normalizedModules,
    normalizationFlags,
    modulesCount,
    tasksCount,
    durationMs,
    metadata,
    finishedAt,
    dbClient,
  } = params;

  return dbClient.transaction(async (tx) => {
    await tx.delete(modules).where(eq(modules.planId, planId));

    const moduleValues = normalizedModules.map(
      (normalizedModule: NormalizedModuleData, index: number) => ({
        planId,
        order: index + 1,
        title: normalizedModule.title,
        description: normalizedModule.description,
        estimatedMinutes: normalizedModule.estimatedMinutes,
      })
    );
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
}
