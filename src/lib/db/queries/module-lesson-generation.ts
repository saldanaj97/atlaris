import type { DbClient, DbTransaction } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type {
  ModuleLessonBatchProviderOutput,
  ModuleLessonGenerationMetadata,
} from '@/shared/types/lesson-content.types';

import {
  canonicalUsageToRecordParams,
  recordUsageInTx,
} from '../../../../supabase/usage';
import {
  getCurrentMonth,
  incrementLessonModulesGeneratedInTx,
} from '@/features/billing/usage-metrics';
import { lockPlanLifecycle } from '@/lib/db/queries/helpers/plan-lifecycle-lock';
import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import { ModuleLessonGenerationMetadataSchema } from '@/shared/schemas/lesson-content.schemas';
import { learningPlans, modules, tasks } from '@supabase/schema';
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

  const taskRows = await dbClient
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
    .orderBy(asc(tasks.order));

  return {
    plan: {
      id: scoped.planId,
      topic: scoped.planTopic,
      skillLevel: scoped.planSkillLevel,
      learningStyle: scoped.planLearningStyle,
    },
    module: scoped.module,
    tasks: taskRows,
    isUnlocked: true,
  };
}

export type LessonGenerationClaimResult =
  | {
      readonly kind: 'claimed';
      readonly workflowStartedAt: string | null;
    }
  | { readonly kind: 'already_ready' }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'not_found' };

type ModuleLessonWorkflowClaimMetadata = {
  readonly runId: string;
  readonly startedAt: string;
};

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
 * (e.g. flag/quota kill switch). Clears in-flight timestamps and error fields.
 * Keeps lessonGenerationMetadata so status polls can match workflowRunId and stop.
 */
export async function revertModuleLessonGeneratingToNotGenerated(
  dbClient: GenerationDb,
  args: {
    readonly userId: string;
    readonly planId: string;
    readonly moduleId: string;
    readonly workflowRunId?: string;
    readonly batchRequestId?: string;
  },
): Promise<void> {
  const matchingClaim =
    args.batchRequestId !== undefined
      ? sql`${modules.lessonGenerationMetadata}->>'batchRequestId' = ${args.batchRequestId}
        AND ${modules.lessonGenerationMetadata}->'workflow' IS NULL`
      : args.workflowRunId
        ? sql`${modules.lessonGenerationMetadata}->'workflow'->>'runId' = ${args.workflowRunId}`
        : undefined;

  await dbClient
    .update(modules)
    .set({
      lessonGenerationStatus: 'not_generated',
      lessonGenerationStartedAt: null,
      lessonGenerationCompletedAt: null,
      lessonGenerationFailedAt: null,
      lessonGenerationError: null,
      // Keep lessonGenerationMetadata (workflow.runId) so status polls can terminate.
    })
    .where(
      and(
        eq(modules.id, args.moduleId),
        eq(modules.planId, args.planId),
        eq(modules.lessonGenerationStatus, 'generating'),
        moduleOwnedByUser(args.userId),
        matchingClaim,
      ),
    );
}

/**
 * CAS: merge `providerStartedAt` into owned module JSON metadata while status
 * is `generating`. Throws unless exactly one row matches.
 */
export async function markModuleLessonProviderStarted(
  dbClient: GenerationDb,
  args: {
    readonly userId: string;
    readonly planId: string;
    readonly moduleId: string;
    readonly providerStartedAt: string;
  },
): Promise<void> {
  await dbClient.transaction(async (tx) => {
    const updated = await tx
      .update(modules)
      .set({
        lessonGenerationMetadata: sql`jsonb_set(
          coalesce(${modules.lessonGenerationMetadata}, '{"version":1}'::jsonb),
          '{providerStartedAt}',
          to_jsonb(${args.providerStartedAt}::text)
        )`,
      })
      .where(
        and(
          eq(modules.id, args.moduleId),
          eq(modules.planId, args.planId),
          eq(modules.lessonGenerationStatus, 'generating'),
          moduleOwnedByUser(args.userId),
        ),
      )
      .returning({ id: modules.id });

    if (updated.length !== 1) {
      throw new Error(
        'Module lesson generation provider-start marker did not match exactly one row',
      );
    }

    await incrementLessonModulesGeneratedInTx(
      tx,
      args.userId,
      getCurrentMonth(new Date(args.providerStartedAt)),
    );
  });
}

async function readScopedModuleState(
  dbClient: GenerationDb,
  planId: string,
  moduleId: string,
  userId: string,
): Promise<{
  status: InferSelectModel<typeof modules>['lessonGenerationStatus'];
  metadata: ModuleLessonGenerationMetadata | null;
} | null> {
  const [row] = await dbClient
    .select({
      status: modules.lessonGenerationStatus,
      metadata: modules.lessonGenerationMetadata,
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

  return row ?? null;
}

function classifyModuleLessonGenerationClaimState(
  state: Awaited<ReturnType<typeof readScopedModuleState>>,
  workflow: ModuleLessonWorkflowClaimMetadata | undefined,
  batchRequestId: string | undefined,
): LessonGenerationClaimResult | null {
  if (state == null) {
    return { kind: 'not_found' };
  }
  if (state.status === 'ready') {
    return { kind: 'already_ready' };
  }
  if (state.status !== 'generating') {
    return null;
  }
  if (
    workflow &&
    state.metadata?.workflow?.runId === workflow.runId &&
    (batchRequestId === undefined ||
      state.metadata.batchRequestId === batchRequestId)
  ) {
    return {
      kind: 'claimed',
      workflowStartedAt: state.metadata.workflow.startedAt ?? null,
    };
  }
  return { kind: 'in_flight' };
}

/**
 * CAS: `not_generated` | `failed` → `generating` for an owned module row.
 * Surfaces `already_ready`, `in_flight`, and `not_found` without mutating.
 * Requires an owned parent plan with `generationStatus = 'ready'`.
 */
export async function claimModuleLessonGenerationOrDescribe(
  dbClient: GenerationDb,
  planId: string,
  moduleId: string,
  userId: string,
  options?: {
    readonly now?: () => Date;
    readonly batchRequestId?: string;
    readonly workflow?: ModuleLessonWorkflowClaimMetadata;
  },
): Promise<LessonGenerationClaimResult> {
  const now = options?.now ?? (() => new Date());
  const claimMetadata =
    options?.batchRequestId !== undefined || options?.workflow
      ? ModuleLessonGenerationMetadataSchema.parse({
          version: 1,
          ...(options.batchRequestId !== undefined
            ? { batchRequestId: options.batchRequestId }
            : {}),
          ...(options.workflow
            ? {
                workflow: {
                  provider: 'workflow-sdk',
                  runId: options.workflow.runId,
                  startedAt: options.workflow.startedAt,
                },
              }
            : {}),
        })
      : undefined;
  const claimStartedAt = options?.workflow
    ? new Date(options.workflow.startedAt)
    : now();

  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  return dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);
    await lockPlanLifecycle(tx, planId);

    const [parent] = await tx
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(
        and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)),
      )
      .limit(1);

    if (!parent) {
      return { kind: 'not_found' };
    }
    if (parent.generationStatus !== 'ready') {
      return { kind: 'in_flight' };
    }

    const attemptClaim = async (): Promise<boolean> => {
      const touched = await tx
        .update(modules)
        .set({
          lessonGenerationStatus: 'generating',
          lessonGenerationStartedAt: claimStartedAt,
          lessonGenerationCompletedAt: null,
          lessonGenerationFailedAt: null,
          lessonGenerationError: null,
          ...(claimMetadata ? { lessonGenerationMetadata: claimMetadata } : {}),
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

    const adoptClaim = async (): Promise<boolean> => {
      if (!options?.workflow || options.batchRequestId === undefined) {
        return false;
      }

      const adopted = await tx
        .update(modules)
        .set({
          lessonGenerationMetadata: claimMetadata,
        })
        .where(
          and(
            eq(modules.id, moduleId),
            eq(modules.planId, planId),
            eq(modules.lessonGenerationStatus, 'generating'),
            moduleOwnedByUser(userId),
            sql`${modules.lessonGenerationMetadata}->>'batchRequestId' = ${options.batchRequestId}`,
            sql`${modules.lessonGenerationMetadata}->'workflow' IS NULL`,
          ),
        )
        .returning({ id: modules.id });

      return adopted.length === 1;
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      if (await attemptClaim()) {
        return {
          kind: 'claimed',
          workflowStartedAt: options?.workflow?.startedAt ?? null,
        };
      }

      if (await adoptClaim()) {
        return {
          kind: 'claimed',
          workflowStartedAt: options?.workflow?.startedAt ?? null,
        };
      }

      const state = await readScopedModuleState(tx, planId, moduleId, userId);
      const result = classifyModuleLessonGenerationClaimState(
        state,
        options?.workflow,
        options?.batchRequestId,
      );
      if (result) {
        return result;
      }
    }

    const state = await readScopedModuleState(tx, planId, moduleId, userId);
    const result = classifyModuleLessonGenerationClaimState(
      state,
      options?.workflow,
      options?.batchRequestId,
    );
    if (result) {
      return result;
    }

    throw new Error(
      `Unexpected module lesson_generation_status after claim retries: ${String(state?.status)}`,
    );
  });
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
 * Updates all task lesson rows for a module in one statement so content and timestamp
 * commit atomically with the module ready transition.
 */
async function updateTaskLessonsInTx(
  tx: Pick<DbTransaction, 'execute'>,
  moduleId: string,
  parsedTasks: ModuleLessonBatchProviderOutput['tasks'],
  finishedAt: Date,
): Promise<void> {
  if (parsedTasks.length === 0) {
    return;
  }

  const valueRows = parsedTasks.map(
    (task) =>
      sql`(${task.taskId}::uuid, ${JSON.stringify(task.content)}::jsonb)`,
  );

  const updated = (await tx.execute(sql`
    UPDATE tasks AS t
    SET
      lesson_content = v.content,
      lesson_content_updated_at = ${finishedAt.toISOString()}::timestamptz
    FROM (VALUES ${sql.join(valueRows, sql`, `)}) AS v(id, content)
    WHERE t.id = v.id
      AND t.module_id = ${moduleId}::uuid
    RETURNING t.id
  `)) as Array<{ id: string }>;

  if (updated.length !== parsedTasks.length) {
    throw new Error(
      `Expected ${parsedTasks.length} task lesson rows updated, got ${updated.length}`,
    );
  }
}

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

    await updateTaskLessonsInTx(
      tx,
      input.moduleId,
      input.parsed.tasks,
      finishedAt,
    );

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
        lessonGenerationError: null,
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
