import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';

import {
  createEmailNotificationDeliveryReferenceTimestamp,
  getEmailNotificationDeliveryLedgerKeys,
  getEmailNotificationDeliveryRunDefinition,
  type EmailNotificationDeliveryRunAction,
} from '@/features/notifications/email/workflows/email-notification-delivery.types';
import { emailNotificationDeliveryWorkflow } from '@/features/notifications/email/workflows/email-notification-delivery.workflow';
import { countEmailNotificationDeliveryManualReviews } from '@/lib/db/queries/email-notification-deliveries';
import {
  failEmailNotificationDeliveryRun,
  loadEmailNotificationDeliveryRunByKey,
  prepareEmailNotificationDeliveryRunResume,
  reserveEmailNotificationDeliveryRun,
} from '@/lib/db/queries/email-notification-delivery-runs';
import { logger } from '@/lib/logging/logger';
import { countMetric } from '@/lib/observability/metrics';
import { db as serviceRoleDb } from '@supabase/service-role';
import { start } from 'workflow/api';

export type StartEmailNotificationDeliveryWorkflowInput = {
  readonly runKind: EmailNotificationDeliveryRunKind;
  readonly schedulerDateUtc: string;
  readonly action: EmailNotificationDeliveryRunAction;
};

export type StartEmailNotificationDeliveryWorkflowOutcome =
  | 'started'
  | 'already_running'
  | 'already_paused'
  | 'already_completed'
  | 'failed_requires_resume'
  | 'needs_review';

export type StartEmailNotificationDeliveryWorkflowResult = {
  readonly outcome: StartEmailNotificationDeliveryWorkflowOutcome;
  readonly runId: string;
  readonly workflowRunId: string | null;
};

export class EmailNotificationDeliveryRunActionError extends Error {
  constructor() {
    super('Email delivery run action is not valid for its current state.');
    this.name = 'EmailNotificationDeliveryRunActionError';
  }
}

type StartEmailNotificationDeliveryWorkflowDeps = {
  readonly dbClient?: DbClient;
  readonly reserve?: typeof reserveEmailNotificationDeliveryRun;
  readonly loadByKey?: typeof loadEmailNotificationDeliveryRunByKey;
  readonly prepare?: typeof prepareEmailNotificationDeliveryRunResume;
  readonly countManualReviews?: typeof countEmailNotificationDeliveryManualReviews;
  readonly workflowStart?: typeof start;
  readonly workflowFn?: typeof emailNotificationDeliveryWorkflow;
  readonly failRun?: typeof failEmailNotificationDeliveryRun;
  readonly log?: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

function existingOutcome(run: {
  id: string;
  status: string;
  workflowRunId: string | null;
}): StartEmailNotificationDeliveryWorkflowResult {
  const outcome =
    run.status === 'completed'
      ? 'already_completed'
      : run.status === 'paused'
        ? 'already_paused'
        : run.status === 'failed'
          ? 'failed_requires_resume'
          : run.status === 'needs_review'
            ? 'needs_review'
            : 'already_running';
  return { outcome, runId: run.id, workflowRunId: run.workflowRunId };
}

async function startReservedEmailNotificationDeliveryWorkflow(
  run: { id: string; runKind: EmailNotificationDeliveryRunKind },
  deps: {
    dbClient: DbClient;
    workflowStart: typeof start;
    workflowFn: typeof emailNotificationDeliveryWorkflow;
    failRun: typeof failEmailNotificationDeliveryRun;
    log: Pick<typeof logger, 'info' | 'warn' | 'error'>;
  },
): Promise<StartEmailNotificationDeliveryWorkflowResult> {
  try {
    const workflow = await deps.workflowStart(deps.workflowFn, [
      { runId: run.id },
    ]);
    deps.log.info(
      {
        source: 'email_notifications',
        event: 'workflow_started',
        runId: run.id,
        workflowRunId: workflow.runId,
        runKind: run.runKind,
      },
      'Email notification delivery workflow started',
    );
    countMetric('atlaris.email.notification.run.workflow_started', 1, {
      attributes: { kind: run.runKind },
    });
    return {
      outcome: 'started',
      runId: run.id,
      workflowRunId: workflow.runId,
    };
  } catch {
    await deps.failRun(
      {
        runId: run.id,
        workflowRunId: null,
        errorClass: 'workflow_start_failed',
        errorMessage: 'Email delivery workflow could not be started.',
      },
      deps.dbClient,
    );
    deps.log.error(
      {
        source: 'email_notifications',
        event: 'workflow_start_failed',
        runId: run.id,
        runKind: run.runKind,
      },
      'Email notification delivery workflow could not be started',
    );
    countMetric('atlaris.email.notification.run.workflow_start_failed', 1, {
      attributes: { kind: run.runKind },
    });
    return {
      outcome: 'failed_requires_resume',
      runId: run.id,
      workflowRunId: null,
    };
  }
}

/**
 * Reserves or explicitly requeues a logical run, then starts Workflow SDK.
 * A duplicate invocation only returns the existing state: it never starts a
 * second workflow for the same `(runKind, schedulerDateUtc)` key.
 */
export async function startEmailNotificationDeliveryWorkflow(
  input: StartEmailNotificationDeliveryWorkflowInput,
  deps: StartEmailNotificationDeliveryWorkflowDeps = {},
): Promise<StartEmailNotificationDeliveryWorkflowResult> {
  const dbClient = deps.dbClient ?? serviceRoleDb;
  const reserve = deps.reserve ?? reserveEmailNotificationDeliveryRun;
  const loadByKey = deps.loadByKey ?? loadEmailNotificationDeliveryRunByKey;
  const prepare = deps.prepare ?? prepareEmailNotificationDeliveryRunResume;
  const countManualReviews =
    deps.countManualReviews ?? countEmailNotificationDeliveryManualReviews;
  const workflowStart = deps.workflowStart ?? start;
  const workflowFn = deps.workflowFn ?? emailNotificationDeliveryWorkflow;
  const failRun = deps.failRun ?? failEmailNotificationDeliveryRun;
  const log = deps.log ?? logger;

  if (input.action === 'start') {
    const reservation = await reserve(
      {
        runKind: input.runKind,
        schedulerDateUtc: input.schedulerDateUtc,
        referenceTimestampUtc:
          createEmailNotificationDeliveryReferenceTimestamp(
            input.runKind,
            input.schedulerDateUtc,
          ),
      },
      dbClient,
    );
    if (reservation.outcome === 'existing') {
      log.info(
        {
          source: 'email_notifications',
          event: 'duplicate_invocation',
          runId: reservation.run.id,
          workflowRunId: reservation.run.workflowRunId,
          runKind: reservation.run.runKind,
        },
        'Email notification delivery invocation reused an existing run',
      );
      countMetric('atlaris.email.notification.run.duplicate', 1, {
        attributes: { kind: reservation.run.runKind },
      });
      return existingOutcome(reservation.run);
    }

    log.info(
      {
        source: 'email_notifications',
        event: 'run_reserved',
        runId: reservation.run.id,
        runKind: reservation.run.runKind,
      },
      'Email notification delivery run reserved',
    );
    countMetric('atlaris.email.notification.run.reserved', 1, {
      attributes: { kind: reservation.run.runKind },
    });

    return startReservedEmailNotificationDeliveryWorkflow(reservation.run, {
      dbClient,
      workflowStart,
      workflowFn,
      failRun,
      log,
    });
  }

  const existing = await loadByKey(
    {
      runKind: input.runKind,
      schedulerDateUtc: input.schedulerDateUtc,
    },
    dbClient,
  );
  if (!existing) {
    throw new EmailNotificationDeliveryRunActionError();
  }

  if (
    input.action === 'replay_reviewed' &&
    existing.status === 'needs_review'
  ) {
    const unresolvedManualReviews = await countManualReviews(
      {
        categories: getEmailNotificationDeliveryRunDefinition(existing.runKind)
          .categories,
        deliveryKeys: getEmailNotificationDeliveryLedgerKeys(
          existing.runKind,
          existing.schedulerDateUtc,
        ),
      },
      dbClient,
    );
    if (unresolvedManualReviews > 0) {
      return existingOutcome(existing);
    }
  }

  const prepared = await prepare(
    { runId: existing.id, action: input.action },
    dbClient,
  );
  if (prepared.outcome === 'invalid_state') {
    throw new EmailNotificationDeliveryRunActionError();
  }

  log.info(
    {
      source: 'email_notifications',
      event: 'manual_resume',
      runId: prepared.run.id,
      runKind: prepared.run.runKind,
      action: input.action,
    },
    'Email notification delivery run was manually requeued',
  );
  countMetric('atlaris.email.notification.run.manual_resume', 1, {
    attributes: { kind: prepared.run.runKind, action: input.action },
  });
  return startReservedEmailNotificationDeliveryWorkflow(prepared.run, {
    dbClient,
    workflowStart,
    workflowFn,
    failRun,
    log,
  });
}
