import type {
  AttemptReservation,
  AttemptsDbClient,
  FinalizeSuccessPersistenceParams,
  GenerationAttemptRecord,
  NormalizedModuleData,
  NormalizedModulesResult,
} from '@/lib/db/queries/types/attempts.types';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { db as serviceDb } from '@/lib/db/service-role';
import {
  aggregateNormalizationFlags,
  normalizeModuleMinutes,
  normalizeTaskMinutes,
} from '@/shared/constants/effort';
import { and, eq, sql } from 'drizzle-orm';

import type { ParsedModule } from '@/shared/types/ai-parser.types';

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

  const shouldNormalizeRlsContext = dbClient !== serviceDb;
  let requestJwtClaims: string | null = null;

  if (shouldNormalizeRlsContext) {
    const claimsRows = await dbClient.execute<{ claims: string | null }>(
      sql`SELECT current_setting('request.jwt.claims', true) AS claims`
    );
    const rawClaims = claimsRows[0]?.claims;
    if (typeof rawClaims === 'string' && rawClaims.length > 0) {
      requestJwtClaims = rawClaims;
    }
  }

  return dbClient.transaction(async (tx) => {
    if (shouldNormalizeRlsContext && requestJwtClaims !== null) {
      await tx.execute(
        sql`SELECT set_config('request.jwt.claims', ${requestJwtClaims}, true)`
      );
    }

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
      const insertedTaskRows = await tx
        .insert(tasks)
        .values(taskValues)
        .returning({ id: tasks.id });

      if (insertedTaskRows.length !== taskValues.length) {
        throw new Error('Failed to insert all tasks for generation attempt.');
      }
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
      .where(
        and(
          eq(generationAttempts.id, attemptId),
          eq(generationAttempts.planId, planId),
          eq(generationAttempts.status, 'in_progress')
        )
      )
      .returning();

    if (!attempt) {
      throw new Error('Failed to finalize generation attempt as success.');
    }

    const [updatedPlan] = await tx
      .update(learningPlans)
      .set({
        generationStatus: 'ready',
        isQuotaEligible: true,
        finalizedAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(learningPlans.id, planId))
      .returning({ id: learningPlans.id });

    if (!updatedPlan) {
      throw new Error('Failed to update learning plan status to ready.');
    }

    return attempt;
  });
}
