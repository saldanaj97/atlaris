import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type {
  LessonContent,
  ModuleLessonBatchProviderOutput,
  ModuleLessonGenerationMetadata,
} from '@/shared/types/lesson-content.types';

import {
  canonicalUsageToRecordParams,
  recordUsageInTx,
} from '../../../../supabase/usage';
import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import { fetchModuleTaskMetricsRows } from '@/lib/db/queries/helpers/task-relations-helpers';
import { ModuleLessonGenerationMetadataSchema } from '@/shared/schemas/lesson-content.schemas';
import { learningPlans, modules, tasks } from '@supabase/schema';
import { MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH } from '@supabase/schema/constants';
import { and, asc, eq, inArray, sql, type InferSelectModel } from 'drizzle-orm';

type GenerationDb = Pick<
  DbClient,
  'select' | 'update' | 'transaction' | 'execute'
>;

export type ModuleLessonGenerationPlanRow = {
  readonly id: string;
  readonly topic: string;
  readonly skillLevel: string;
  readonly learningStyle: string;
};

export type ModuleLessonGenerationTaskRow = Pick<
  InferSelectModel<typeof tasks>,
  | 'id'
  | 'moduleId'
  | 'order'
  | 'title'
  | 'description'
  | 'estimatedMinutes'
  | 'hasMicroExplanation'
  | 'lessonContent'
>;

/**
 * Ownership-scoped plan + module + ordered tasks for module lesson batch generation.
 */
export type ModuleLessonGenerationContext = {
  readonly plan: ModuleLessonGenerationPlanRow;
  readonly module: InferSelectModel<typeof modules>;
  readonly tasks: readonly ModuleLessonGenerationTaskRow[];
  readonly isUnlocked: boolean;
};

const claimableStatuses = ['not_generated', 'failed'] as const;

function moduleOwnedByUser(userId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${learningPlans}
    WHERE ${learningPlans.id} = ${modules.planId}
    AND ${learningPlans.userId} = ${userId}
  )`;
}

function isModuleUnlockedForLessonGeneration(
  metrics: readonly {
    readonly moduleId: string;
    readonly totalTasks: number;
    readonly completedTasks: number;
  }[],
  moduleId: string,
): boolean {
  for (const metric of metrics) {
    if (metric.moduleId === moduleId) {
      return true;
    }

    if (
      Number(metric.totalTasks) > 0 &&
      Number(metric.completedTasks) < Number(metric.totalTasks)
    ) {
      return false;
    }
  }

  return false;
}

/**
 * Loads plan (prompt fields), module, and tasks in module order. Null if module/plan not found for user.
 */
export async function loadModuleLessonGenerationContext(
  dbClient: GenerationDb,
  planId: string,
  moduleId: string,
  userId: string,
): Promise<ModuleLessonGenerationContext | null> {
  const [scoped] = await dbClient
    .select({
      planId: learningPlans.id,
      planTopic: learningPlans.topic,
      planSkillLevel: learningPlans.skillLevel,
      planLearningStyle: learningPlans.learningStyle,
      module: modules,
    })
    .from(modules)
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(
      and(
        eq(modules.id, moduleId),
        eq(modules.planId, planId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);

  if (!scoped) {
    return null;
  }

  const [moduleMetricsRows, taskRows] = await Promise.all([
    fetchModuleTaskMetricsRows({
      planIds: [planId],
      userId,
      dbClient,
    }),
    dbClient
      .select({
        id: tasks.id,
        moduleId: tasks.moduleId,
        order: tasks.order,
        title: tasks.title,
        description: tasks.description,
        estimatedMinutes: tasks.estimatedMinutes,
        hasMicroExplanation: tasks.hasMicroExplanation,
        lessonContent: tasks.lessonContent,
      })
      .from(tasks)
      .where(eq(tasks.moduleId, moduleId))
      .orderBy(asc(tasks.order)),
  ]);

  return {
    plan: {
      id: scoped.planId,
      topic: scoped.planTopic,
      skillLevel: scoped.planSkillLevel,
      learningStyle: scoped.planLearningStyle,
    },
    module: scoped.module,
    tasks: taskRows,
    isUnlocked: isModuleUnlockedForLessonGeneration(
      moduleMetricsRows,
      moduleId,
    ),
  };
}

export type LessonGenerationClaimResult =
  | { readonly kind: 'claimed' }
  | { readonly kind: 'already_ready' }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'not_found' };

export type PersistModuleLessonWorkflowRunInput = {
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly runId: string;
  readonly startedAt?: string;
};

function truncateGenerationError(message: string): string {
  return message.slice(0, MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH);
}

function assertParsedTasksMatchCurrentTaskRows(
  parsed: ModuleLessonBatchProviderOutput,
  currentRows: readonly { id: string }[],
): void {
  const parsedTaskIds = parsed.tasks.map((task) => task.taskId);
  const currentTaskIds = currentRows.map((task) => task.id);

  if (parsedTaskIds.length !== currentTaskIds.length) {
    throw new Error(
      `Module lesson batch task coverage drifted before persist: expected ${String(currentTaskIds.length)} current tasks, got ${String(parsedTaskIds.length)} generated tasks.`,
    );
  }

  for (let i = 0; i < currentTaskIds.length; i++) {
    if (parsedTaskIds[i] !== currentTaskIds[i]) {
      throw new Error(
        `Module lesson batch task coverage drifted before persist at index ${String(i)}.`,
      );
    }
  }
}

/**
 * After `generating` claim, returns row to `not_generated` when work never ran
 * (e.g. monthly quota denial). Clears in-flight timestamps and error fields.
 */
export async function revertModuleLessonGeneratingToNotGenerated(
  dbClient: GenerationDb,
  args: {
    readonly userId: string;
    readonly planId: string;
    readonly moduleId: string;
  },
): Promise<void> {
  await dbClient
    .update(modules)
    .set({
      lessonGenerationStatus: 'not_generated',
      lessonGenerationStartedAt: null,
      lessonGenerationCompletedAt: null,
      lessonGenerationFailedAt: null,
      lessonGenerationError: null,
    })
    .where(
      and(
        eq(modules.id, args.moduleId),
        eq(modules.planId, args.planId),
        eq(modules.lessonGenerationStatus, 'generating'),
        moduleOwnedByUser(args.userId),
      ),
    );
}

async function readScopedModuleStatus(
  dbClient: GenerationDb,
  planId: string,
  moduleId: string,
  userId: string,
): Promise<InferSelectModel<typeof modules>['lessonGenerationStatus'] | null> {
  const [row] = await dbClient
    .select({ status: modules.lessonGenerationStatus })
    .from(modules)
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(
      and(
        eq(modules.id, moduleId),
        eq(modules.planId, planId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);

  return row?.status ?? null;
}

/**
 * Records Workflow SDK run metadata on a module already in `generating` state.
 */
export async function persistModuleLessonWorkflowRunMetadata(
  dbClient: GenerationDb,
  input: PersistModuleLessonWorkflowRunInput,
): Promise<void> {
  const metadata = ModuleLessonGenerationMetadataSchema.parse({
    version: 1,
    workflow: {
      provider: 'workflow-sdk',
      runId: input.runId,
      startedAt: input.startedAt,
    },
  });

  const updated = await dbClient
    .update(modules)
    .set({ lessonGenerationMetadata: metadata })
    .where(
      and(
        eq(modules.id, input.moduleId),
        eq(modules.planId, input.planId),
        eq(modules.lessonGenerationStatus, 'generating'),
        moduleOwnedByUser(input.userId),
      ),
    )
    .returning({ id: modules.id });

  if (updated.length !== 1) {
    throw new Error(
      'Module lesson workflow metadata update did not match exactly one row',
    );
  }
}

/**
 * CAS: `not_generated` | `failed` → `generating` for an owned module row.
 * Surfaces `already_ready`, `in_flight`, and `not_found` without mutating.
 */
export async function claimModuleLessonGenerationOrDescribe(
  dbClient: GenerationDb,
  planId: string,
  moduleId: string,
  userId: string,
  now: () => Date = () => new Date(),
): Promise<LessonGenerationClaimResult> {
  const attemptClaim = async (): Promise<boolean> => {
    const touched = await dbClient
      .update(modules)
      .set({
        lessonGenerationStatus: 'generating',
        lessonGenerationStartedAt: now(),
        lessonGenerationCompletedAt: null,
        lessonGenerationFailedAt: null,
        lessonGenerationError: null,
      })
      .where(
        and(
          eq(modules.id, moduleId),
          eq(modules.planId, planId),
          inArray(modules.lessonGenerationStatus, [...claimableStatuses]),
          moduleOwnedByUser(userId),
        ),
      )
      .returning({ id: modules.id });

    return touched.length === 1;
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (await attemptClaim()) {
      return { kind: 'claimed' };
    }

    const status = await readScopedModuleStatus(
      dbClient,
      planId,
      moduleId,
      userId,
    );

    if (status == null) {
      return { kind: 'not_found' };
    }
    if (status === 'ready') {
      return { kind: 'already_ready' };
    }
    if (status === 'generating') {
      return { kind: 'in_flight' };
    }
  }

  const status = await readScopedModuleStatus(
    dbClient,
    planId,
    moduleId,
    userId,
  );
  if (status == null) {
    return { kind: 'not_found' };
  }
  if (status === 'ready') {
    return { kind: 'already_ready' };
  }
  if (status === 'generating') {
    return { kind: 'in_flight' };
  }

  throw new Error(
    `Unexpected module lesson_generation_status after claim retries: ${String(status)}`,
  );
}

export type CommitModuleLessonBatchSuccessInput = {
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly parsed: ModuleLessonBatchProviderOutput;
  readonly metadata: ModuleLessonGenerationMetadata;
  readonly usage: CanonicalAIUsage;
  readonly requestId?: string | null;
  readonly now?: () => Date;
};

/**
 * Persists all task lessons, module ready fields, metadata, and AI usage in one RLS-aware transaction.
 */
export async function commitModuleLessonBatchSuccess(
  dbClient: DbClient,
  input: CommitModuleLessonBatchSuccessInput,
): Promise<void> {
  const nowFn = input.now ?? (() => new Date());
  const finishedAt = nowFn();
  const metadata = ModuleLessonGenerationMetadataSchema.parse(input.metadata);

  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  await dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    const currentTasks = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.moduleId, input.moduleId))
      .orderBy(asc(tasks.order));

    assertParsedTasksMatchCurrentTaskRows(input.parsed, currentTasks);

    for (const task of input.parsed.tasks) {
      const updated = await tx
        .update(tasks)
        .set({
          lessonContent: task.content as LessonContent,
          lessonContentUpdatedAt: finishedAt,
        })
        .where(
          and(eq(tasks.id, task.taskId), eq(tasks.moduleId, input.moduleId)),
        )
        .returning({ id: tasks.id });

      if (updated.length !== 1) {
        throw new Error(
          `Expected exactly one task lesson row updated for task ${task.taskId}`,
        );
      }
    }

    const moduleUpdated = await tx
      .update(modules)
      .set({
        lessonGenerationStatus: 'ready',
        lessonGenerationCompletedAt: finishedAt,
        lessonGenerationFailedAt: null,
        lessonGenerationError: null,
        lessonGenerationMetadata: metadata,
      })
      .where(
        and(
          eq(modules.id, input.moduleId),
          eq(modules.planId, input.planId),
          eq(modules.lessonGenerationStatus, 'generating'),
          moduleOwnedByUser(input.userId),
        ),
      )
      .returning({ id: modules.id });

    if (moduleUpdated.length !== 1) {
      throw new Error(
        'Module lesson generation success update did not match exactly one row',
      );
    }

    await recordUsageInTx(
      tx,
      canonicalUsageToRecordParams(input.usage, input.userId, input.requestId),
    );
  });
}

export type CommitModuleLessonGenerationFailureInput = {
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly message: string;
  readonly now?: () => Date;
};

/**
 * Marks module lesson generation failed without touching task `lesson_content` (own transaction).
 */
export async function commitModuleLessonGenerationFailure(
  dbClient: DbClient,
  input: CommitModuleLessonGenerationFailureInput,
): Promise<void> {
  const nowFn = input.now ?? (() => new Date());
  const failedAt = nowFn();
  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  await dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    const moduleUpdated = await tx
      .update(modules)
      .set({
        lessonGenerationStatus: 'failed',
        lessonGenerationFailedAt: failedAt,
        lessonGenerationError: truncateGenerationError(input.message),
        lessonGenerationCompletedAt: null,
      })
      .where(
        and(
          eq(modules.id, input.moduleId),
          eq(modules.planId, input.planId),
          eq(modules.lessonGenerationStatus, 'generating'),
          moduleOwnedByUser(input.userId),
        ),
      )
      .returning({ id: modules.id });

    if (moduleUpdated.length !== 1) {
      throw new Error(
        'Module lesson generation failure update did not match exactly one row',
      );
    }
  });
}
