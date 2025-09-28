import { getCorrelationId } from '@/lib/api/context';
import type { InferSelectModel } from 'drizzle-orm';
import { count, eq } from 'drizzle-orm';

import type { ParsedModule } from '@/lib/ai/parser';
import type { ProviderMetadata } from '@/lib/ai/provider';
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

import type { GenerationInput } from '@/lib/ai/provider';
import { db } from '../drizzle';
import { generationAttempts, learningPlans, modules, tasks } from '../schema';

const ATTEMPT_CAP = Number(process.env.ATTEMPT_CAP) || 3;

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
  dbClient?: typeof db;
  now?: () => Date;
}

export interface RecordSuccessParams {
  planId: string;
  preparation: AttemptPreparation;
  modules: ParsedModule[];
  providerMetadata?: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  dbClient?: typeof db;
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
  dbClient?: typeof db;
  now?: () => Date;
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
  console.info(`[attempts] ${event}`, enriched);
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
  if (typeof topicResult.value !== 'string') {
    throw new Error('Generation input topic must be a string.');
  }

  const topicValue = topicResult.value;

  const notesResult = truncateToLength(
    input.notes ?? undefined,
    NOTES_MAX_LENGTH
  );

  return {
    topic: {
      value: topicValue,
      truncated: topicResult.truncated,
      originalLength:
        topicResult.originalLength ?? topicValue.length ?? input.topic.length,
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

export async function startAttempt({
  planId,
  userId,
  input,
  dbClient,
  now,
}: StartAttemptParams): Promise<AttemptPreparation> {
  const client = dbClient ?? db;
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
  const client = dbClient ?? db;
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
  const client = dbClient ?? db;
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

export { ATTEMPT_CAP };
