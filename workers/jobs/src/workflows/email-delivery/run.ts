import type { EmailRecipientGuard } from './recipient-allowlist';
import type { EmailSender } from '@/features/notifications/email/types';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';
import type {
  WorkflowDelayFunction,
  WorkflowEvent,
  WorkflowStep,
} from 'cloudflare:workers';

import {
  resolveScheduledEmailDeliveryRun,
  type ScheduledEmailDeliveryRun,
} from './schedule';
import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import {
  createEmailNotificationDeliveryReferenceTimestamp,
  getEmailNotificationDeliveryLedgerKeys,
  getEmailNotificationDeliveryRunDefinition,
} from '@/features/notifications/email/workflows/email-notification-delivery.types';
import { EnvValidationError } from '@/lib/config/env/shared';
import { summarizeEmailNotificationDeliveriesForRun } from '@/lib/db/queries/email-notification-deliveries';
import {
  advanceEmailNotificationDeliveryRun,
  claimEmailNotificationDeliveryRun,
  completeEmailNotificationDeliveryRun,
  failEmailNotificationDeliveryRun,
  loadEmailNotificationDeliveryRun,
  markEmailNotificationDeliveryRunNeedsReview,
  pauseEmailNotificationDeliveryRun,
  recordEmailNotificationDeliveryRunRetry,
  reserveEmailNotificationDeliveryRun,
} from '@/lib/db/queries/email-notification-delivery-runs';
import { countMetric } from '@/lib/observability/metrics';
import { z } from 'zod';

export const EMAIL_DELIVERY_JOB = 'email-delivery';

/**
 * Recipients per page step. Each page may make one Resend call per recipient
 * (rarely two), plus Sentry, against the Free plan's 50 external subrequests
 * per step (design note, Decision 9).
 */
export const EMAIL_DELIVERY_PAGE_SIZE = 20;

/** Retries per step after the first attempt; the last attempt fails the run. */
export const EMAIL_DELIVERY_STEP_RETRY_LIMIT = 3;
const DEFAULT_RETRY_DELAY_MS = 60 * 1000;

/** `workflow_run_id` values written by the Worker carry this runtime marker. */
export const CLOUDFLARE_WORKFLOW_RUN_ID_PREFIX = 'cf:';

/** Instance params for manual commands; scheduled instances carry none. */
export type EmailDeliveryWorkflowParams = { v: 1; runId: string };

const paramsSchema = z.object({ v: z.literal(1), runId: z.uuid() });

export type EmailDeliveryWorkflowOutcome =
  | { kind: 'disabled' }
  | { kind: 'unknown_schedule' }
  | { kind: 'duplicate'; runId: string }
  | { kind: 'in_flight' }
  | { kind: 'terminal' }
  | { kind: 'paused' }
  | { kind: 'completed' };

type ClaimResult =
  | { kind: 'claimed'; runId: string }
  | Exclude<EmailDeliveryWorkflowOutcome, { kind: 'completed' | 'paused' }>;

type PageResult =
  | { kind: 'page_processed'; nextCursor: string | null }
  | { kind: 'in_flight' }
  | { kind: 'paused' };

type FinalizeResult = { kind: 'completed' } | { kind: 'in_flight' };

/** What one attempt of a page or finalize step decided. */
type StepAttempt<T> =
  | { kind: 'done'; result: T }
  | { kind: 'retry'; errorClass: string; retryAfterMs: number }
  | { kind: 'fail_run'; errorClass: string; message: string }
  | { kind: 'stop'; message: string };

export type EmailDeliveryWorkflowDeps = {
  /** `isJobEnabled(env, 'EMAIL_DELIVERY')`: the Worker form of the delivery flag. */
  isEnabled: () => boolean;
  recipientGuard: EmailRecipientGuard;
  /** Runs `fn` with a database client that lives for this step only. */
  withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  createSender: () => EmailSender;
  logger: Logger;
  captureException: (
    error: Error,
    context: { tags: Record<string, string> },
  ) => void;
  /** Builds `NonRetryableError` from `cloudflare:workflows`. */
  nonRetryable: (message: string) => Error;
  now?: () => Date;
};

/** Thrown to retry a step after `retryAfterMs` (read by the delay function). */
export class EmailDeliveryRetryError extends Error {
  constructor(
    readonly errorClass: string,
    readonly retryAfterMs: number,
  ) {
    super(`Email delivery retry scheduled: ${errorClass}`);
    this.name = 'EmailDeliveryRetryError';
  }
}

function backoffMs(attempt: number): number {
  return Math.max(DEFAULT_RETRY_DELAY_MS, attempt ** 2 * 1000);
}

export const emailDeliveryRetryDelay: WorkflowDelayFunction = ({
  ctx,
  error,
}) =>
  error instanceof EmailDeliveryRetryError
    ? error.retryAfterMs
    : backoffMs(ctx.attempt);

/** Explicit retries (default is 5) and a timeout below the 15-minute ledger lease. */
export const EMAIL_DELIVERY_STEP_CONFIG = {
  retries: {
    limit: EMAIL_DELIVERY_STEP_RETRY_LIMIT,
    delay: emailDeliveryRetryDelay,
  },
  timeout: '10 minutes',
} as const;

function isLastAttempt(attempt: number): boolean {
  return attempt > EMAIL_DELIVERY_STEP_RETRY_LIMIT;
}

function logRunEvent(
  deps: Pick<EmailDeliveryWorkflowDeps, 'logger'>,
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
): void {
  deps.logger[level](
    {
      source: 'email_notifications',
      job: EMAIL_DELIVERY_JOB,
      runtime: 'cloudflare-worker',
      event,
      ...fields,
    },
    `Email notification delivery ${event.replaceAll('_', ' ')}`,
  );
}

function reportRunProblem(
  deps: EmailDeliveryWorkflowDeps,
  message: string,
  runKind: EmailNotificationDeliveryRunKind,
  errorClass: string,
): void {
  deps.captureException(new Error(message), {
    tags: {
      job: EMAIL_DELIVERY_JOB,
      runtime: 'cloudflare-worker',
      runKind,
      errorClass,
    },
  });
}

async function loadOwnedRunningRun(
  db: DbClient,
  runId: string,
  workflowRunId: string,
) {
  const run = await loadEmailNotificationDeliveryRun(runId, db);
  if (!run || run.status !== 'running' || run.workflowRunId !== workflowRunId) {
    return null;
  }
  return run;
}

async function terminalizeFailedRun(
  db: DbClient,
  deps: EmailDeliveryWorkflowDeps,
  ids: { runId: string; workflowRunId: string },
  errorClass: string,
  errorMessage: string,
): Promise<void> {
  const run = await loadEmailNotificationDeliveryRun(ids.runId, db);
  if (!run) {
    return;
  }
  const transition = await failEmailNotificationDeliveryRun(
    {
      runId: ids.runId,
      workflowRunId:
        run.status === 'queued' && run.workflowRunId === null
          ? null
          : ids.workflowRunId,
      errorClass,
      errorMessage,
    },
    db,
  );
  if (transition.outcome === 'transitioned') {
    countMetric('atlaris.email.notification.run.failed', 1, {
      attributes: { kind: run.runKind, reason: errorClass },
    });
    logRunEvent(deps, 'error', 'run_failed', {
      ...ids,
      runKind: run.runKind,
      errorClass,
    });
    reportRunProblem(deps, errorMessage, run.runKind, errorClass);
  }
}

type ClaimTarget =
  | { kind: 'scheduled'; scheduled: ScheduledEmailDeliveryRun }
  | { kind: 'manual'; runId: string };

/** Resolves what the first step claims, or why the instance exits early. */
function resolveClaimTarget(
  event: Readonly<WorkflowEvent<EmailDeliveryWorkflowParams>>,
  workflowRunId: string,
  deps: EmailDeliveryWorkflowDeps,
):
  | ClaimTarget
  | Extract<ClaimResult, { kind: 'disabled' | 'unknown_schedule' }> {
  if (!event.schedule) {
    const params = paramsSchema.safeParse(event.payload);
    if (!params.success) {
      throw deps.nonRetryable('Email delivery workflow params are invalid');
    }
    return { kind: 'manual', runId: params.data.runId };
  }

  const scheduled = resolveScheduledEmailDeliveryRun(event.schedule);
  if (!scheduled) {
    logRunEvent(deps, 'error', 'unknown_schedule', {
      cron: event.schedule.cron,
      workflowRunId,
    });
    return { kind: 'unknown_schedule' };
  }
  // Same order as the Vercel cron route: stop before reserving work.
  if (!deps.isEnabled()) {
    logRunEvent(deps, 'info', 'scheduled_run_disabled', {
      ...scheduled,
      workflowRunId,
    });
    return { kind: 'disabled' };
  }
  return { kind: 'scheduled', scheduled };
}

/**
 * First step: claims the logical run. A scheduled firing reserves the
 * `(run_kind, scheduler_date_utc)` key first, so a duplicate firing exits
 * without sending; a manual command arrives with a run already reserved or
 * requeued by the command handler.
 */
async function claimRun(
  event: Readonly<WorkflowEvent<EmailDeliveryWorkflowParams>>,
  workflowRunId: string,
  attempt: number,
  deps: EmailDeliveryWorkflowDeps,
): Promise<ClaimResult> {
  const target = resolveClaimTarget(event, workflowRunId, deps);
  if (target.kind !== 'scheduled' && target.kind !== 'manual') {
    return target;
  }

  return deps.withDb(async (db) => {
    let runId = target.kind === 'manual' ? target.runId : null;
    try {
      if (target.kind === 'scheduled') {
        const { scheduled } = target;
        const reservation = await reserveEmailNotificationDeliveryRun(
          {
            ...scheduled,
            referenceTimestampUtc:
              createEmailNotificationDeliveryReferenceTimestamp(
                scheduled.runKind,
                scheduled.schedulerDateUtc,
              ),
          },
          db,
        );
        runId = reservation.run.id;
        // An unclaimed queued row has no live owner yet, so claim it.
        const unclaimedQueued =
          reservation.run.status === 'queued' &&
          reservation.run.workflowRunId === null;
        if (reservation.outcome === 'existing' && !unclaimedQueued) {
          logRunEvent(deps, 'info', 'duplicate_invocation', {
            runId,
            workflowRunId,
            runKind: reservation.run.runKind,
          });
          countMetric('atlaris.email.notification.run.duplicate', 1, {
            attributes: { kind: reservation.run.runKind },
          });
          return { kind: 'duplicate', runId };
        }
      }

      const claim = await claimEmailNotificationDeliveryRun(
        { runId: runId as string, workflowRunId },
        db,
      );
      if (claim.outcome === 'in_flight') {
        return { kind: 'in_flight' };
      }
      if (claim.outcome === 'terminal') {
        return { kind: 'terminal' };
      }
      logRunEvent(deps, 'info', 'run_claimed', {
        runId: claim.run.id,
        workflowRunId,
        runKind: claim.run.runKind,
      });
      return { kind: 'claimed', runId: claim.run.id };
    } catch (error) {
      if (!isLastAttempt(attempt)) {
        logRunEvent(deps, 'warn', 'claim_retry_scheduled', {
          runId,
          workflowRunId,
          attempt,
        });
        throw error;
      }
      if (runId) {
        await terminalizeFailedRun(
          db,
          deps,
          { runId, workflowRunId },
          'claim_retry_exhausted',
          'Email delivery run claim retries were exhausted.',
        );
      }
      throw deps.nonRetryable('Email delivery run claim retry limit exhausted');
    }
  });
}

async function attemptPage(
  db: DbClient,
  ids: { runId: string; workflowRunId: string },
  deps: EmailDeliveryWorkflowDeps,
): Promise<StepAttempt<PageResult>> {
  const run = await loadOwnedRunningRun(db, ids.runId, ids.workflowRunId);
  if (!run) {
    return { kind: 'done', result: { kind: 'in_flight' } };
  }
  if (run.scanCompletedAt) {
    return {
      kind: 'done',
      result: { kind: 'page_processed', nextCursor: null },
    };
  }

  // The Worker env is fixed for one step invocation, so this check covers
  // every Resend call the page makes.
  const pauseReason = !deps.isEnabled()
    ? 'delivery_switch_disabled'
    : deps.recipientGuard.kind === 'unconfigured'
      ? 'test_recipient_allowlist_missing'
      : null;
  if (pauseReason) {
    if (pauseReason === 'test_recipient_allowlist_missing') {
      logRunEvent(deps, 'error', 'test_recipient_allowlist_missing', {
        ...ids,
        reason:
          'EMAIL_TEST_RECIPIENT_ALLOWLIST is not set outside production; sending nothing.',
      });
    }
    const paused = await pauseEmailNotificationDeliveryRun(
      { ...ids, reason: pauseReason },
      db,
    );
    if (paused.outcome !== 'transitioned') {
      return { kind: 'done', result: { kind: 'in_flight' } };
    }
    logRunEvent(deps, 'info', 'run_paused', {
      ...ids,
      runKind: run.runKind,
      reason: pauseReason,
    });
    return { kind: 'done', result: { kind: 'paused' } };
  }

  const definition = getEmailNotificationDeliveryRunDefinition(run.runKind);
  const result = await runEmailNotificationDelivery(
    {
      categories: [...definition.categories],
      schedulerDateUtc: run.schedulerDateUtc,
      cursorUserId: run.cursorUserId,
      batchSize: EMAIL_DELIVERY_PAGE_SIZE,
    },
    {
      db,
      sender: deps.createSender(),
      logger: deps.logger,
      now: run.referenceTimestampUtc,
      deliveryNow: deps.now?.() ?? new Date(),
      canDeliverTo:
        deps.recipientGuard.kind === 'allowlist'
          ? deps.recipientGuard.canDeliverTo
          : undefined,
    },
  );

  if (result.pageFailure?.kind === 'terminal') {
    return {
      kind: 'fail_run',
      errorClass: result.pageFailure.failureClass,
      message:
        'Email delivery page failed with a terminal provider or configuration error.',
    };
  }
  if (result.pageFailure?.kind === 'retryable') {
    return {
      kind: 'retry',
      errorClass: result.pageFailure.failureClass,
      retryAfterMs: result.pageFailure.retryAfterMs,
    };
  }

  const advanced = await advanceEmailNotificationDeliveryRun(
    {
      ...ids,
      expectedCursorUserId: run.cursorUserId,
      nextCursorUserId: result.nextCursor,
      counts: result,
    },
    db,
  );
  if (advanced.outcome === 'stale') {
    // Cursor CAS lost (often a replay after a prior advance). Continue from
    // the persisted cursor while this instance still owns the run.
    const owned = await loadOwnedRunningRun(db, ids.runId, ids.workflowRunId);
    if (!owned) {
      return { kind: 'done', result: { kind: 'in_flight' } };
    }
    return {
      kind: 'done',
      result: {
        kind: 'page_processed',
        nextCursor: owned.scanCompletedAt ? null : owned.cursorUserId,
      },
    };
  }

  countMetric('atlaris.email.notification.run.page_completed', 1, {
    attributes: { kind: run.runKind },
  });
  logRunEvent(deps, 'info', 'page_completed', {
    ...ids,
    runKind: run.runKind,
  });
  return {
    kind: 'done',
    result: { kind: 'page_processed', nextCursor: result.nextCursor },
  };
}

async function attemptFinalize(
  db: DbClient,
  ids: { runId: string; workflowRunId: string },
  attempt: number,
  deps: EmailDeliveryWorkflowDeps,
): Promise<StepAttempt<FinalizeResult>> {
  const run = await loadEmailNotificationDeliveryRun(ids.runId, db);
  if (!run) {
    return { kind: 'stop', message: 'Email delivery run was not found' };
  }
  if (run.status !== 'running' || run.workflowRunId !== ids.workflowRunId) {
    return { kind: 'done', result: { kind: 'in_flight' } };
  }

  const ledgerSummary = await summarizeEmailNotificationDeliveriesForRun(
    {
      categories: getEmailNotificationDeliveryRunDefinition(run.runKind)
        .categories,
      deliveryKeys: getEmailNotificationDeliveryLedgerKeys(
        run.runKind,
        run.schedulerDateUtc,
      ),
    },
    db,
  );
  if (
    run.recipientErrors > 0 ||
    run.failed > 0 ||
    run.manualReview > 0 ||
    ledgerSummary.failed > 0 ||
    ledgerSummary.manualReview > 0
  ) {
    const reviewed = await markEmailNotificationDeliveryRunNeedsReview(
      {
        ...ids,
        errorClass: 'recipient_or_delivery_review_required',
        errorMessage:
          'Email delivery completed with recipient or provider review required.',
        ledgerSummary,
      },
      db,
    );
    if (reviewed.outcome === 'transitioned') {
      countMetric('atlaris.email.notification.run.needs_review', 1, {
        attributes: { kind: run.runKind },
      });
      logRunEvent(deps, 'warn', 'run_needs_review', {
        ...ids,
        runKind: run.runKind,
      });
      reportRunProblem(
        deps,
        'Email delivery run needs manual review',
        run.runKind,
        'recipient_or_delivery_review_required',
      );
    }
    return { kind: 'stop', message: 'Email delivery requires manual review' };
  }

  const completed = await completeEmailNotificationDeliveryRun(
    { ...ids, ledgerSummary },
    db,
  );
  if (completed.outcome === 'stale') {
    const owned = await loadOwnedRunningRun(db, ids.runId, ids.workflowRunId);
    if (!owned) {
      return { kind: 'done', result: { kind: 'in_flight' } };
    }
    return {
      kind: 'retry',
      errorClass: 'finalization_stale',
      retryAfterMs: backoffMs(attempt),
    };
  }

  countMetric('atlaris.email.notification.run.completed', 1, {
    attributes: { kind: run.runKind },
  });
  logRunEvent(deps, 'info', 'run_completed', { ...ids, runKind: run.runKind });
  return { kind: 'done', result: { kind: 'completed' } };
}

/**
 * Turns a page or finalize attempt into the step's result. Retryable outcomes
 * record the error and throw `EmailDeliveryRetryError`; on the last attempt,
 * or for permanent failures, the run is failed and the step throws
 * `NonRetryableError`. Nothing ever resends automatically.
 */
async function settleStep<T>(
  db: DbClient,
  ids: { runId: string; workflowRunId: string },
  attempt: number,
  deps: EmailDeliveryWorkflowDeps,
  run: () => Promise<StepAttempt<T>>,
  unexpectedErrorClass: string,
): Promise<T | { kind: 'in_flight' }> {
  let outcome: StepAttempt<T>;
  try {
    outcome = await run();
  } catch (error) {
    outcome =
      error instanceof EnvValidationError
        ? {
            kind: 'fail_run',
            errorClass: 'email_configuration',
            message: 'Email delivery configuration is invalid.',
          }
        : {
            kind: 'retry',
            errorClass: unexpectedErrorClass,
            retryAfterMs: backoffMs(attempt),
          };
  }

  switch (outcome.kind) {
    case 'done':
      return outcome.result;
    case 'stop':
      throw deps.nonRetryable(outcome.message);
    case 'fail_run':
      await terminalizeFailedRun(
        db,
        deps,
        ids,
        outcome.errorClass,
        outcome.message,
      );
      throw deps.nonRetryable(outcome.message);
    case 'retry': {
      if (isLastAttempt(attempt)) {
        await terminalizeFailedRun(
          db,
          deps,
          ids,
          'retry_exhausted',
          'Email delivery step retries were exhausted.',
        );
        throw deps.nonRetryable('Email delivery step retry limit exhausted');
      }
      const retry = await recordEmailNotificationDeliveryRunRetry(
        {
          ...ids,
          errorClass: outcome.errorClass,
          errorMessage: 'Email delivery step retry is scheduled.',
        },
        db,
      );
      if (
        retry.outcome === 'stale' &&
        !(await loadOwnedRunningRun(db, ids.runId, ids.workflowRunId))
      ) {
        return { kind: 'in_flight' };
      }
      countMetric('atlaris.email.notification.run.retry_scheduled', 1, {
        attributes: { reason: outcome.errorClass },
      });
      logRunEvent(deps, 'warn', 'retry_scheduled', {
        ...ids,
        errorClass: outcome.errorClass,
        attempt,
      });
      throw new EmailDeliveryRetryError(
        outcome.errorClass,
        outcome.retryAfterMs,
      );
    }
  }
}

/**
 * The email Workflow body: claim, one step per recipient page, finalize.
 * Step names are fixed (`claim-run`, `page-<n>`, `finalize`); never rename or
 * reorder them while instances may be in flight.
 */
export async function runEmailDeliveryWorkflow(
  event: Readonly<WorkflowEvent<EmailDeliveryWorkflowParams>>,
  step: Pick<WorkflowStep, 'do'>,
  deps: EmailDeliveryWorkflowDeps,
): Promise<EmailDeliveryWorkflowOutcome> {
  const workflowRunId = `${CLOUDFLARE_WORKFLOW_RUN_ID_PREFIX}${event.instanceId}`;

  const claim = await step.do('claim-run', EMAIL_DELIVERY_STEP_CONFIG, (ctx) =>
    claimRun(event, workflowRunId, ctx.attempt, deps),
  );
  if (claim.kind !== 'claimed') {
    return claim;
  }
  const ids = { runId: claim.runId, workflowRunId };

  for (let page = 1; ; page += 1) {
    const result = await step.do(
      `page-${page}`,
      EMAIL_DELIVERY_STEP_CONFIG,
      (ctx) =>
        deps.withDb((db) =>
          settleStep(
            db,
            ids,
            ctx.attempt,
            deps,
            () => attemptPage(db, ids, deps),
            'page_processing_error',
          ),
        ),
    );
    if (result.kind !== 'page_processed') {
      return result;
    }
    if (result.nextCursor === null) {
      break;
    }
  }

  return step.do('finalize', EMAIL_DELIVERY_STEP_CONFIG, (ctx) =>
    deps.withDb((db) =>
      settleStep(
        db,
        ids,
        ctx.attempt,
        deps,
        () => attemptFinalize(db, ids, ctx.attempt, deps),
        'finalization_error',
      ),
    ),
  );
}
