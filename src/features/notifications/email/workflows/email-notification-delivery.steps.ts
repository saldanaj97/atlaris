import type {
  EmailNotificationDeliveryWorkflowClaimResult,
  EmailNotificationDeliveryWorkflowInput,
  EmailNotificationDeliveryWorkflowPageResult,
  EmailNotificationDeliveryWorkflowTerminalResult,
} from './email-notification-delivery.types';

import { resolveEmailNotificationDeliveryEnabled } from '@/features/notifications/email/delivery-flag';
import {
  finishEmailNotificationDeliveryMonitor,
  startEmailNotificationDeliveryMonitor,
} from '@/features/notifications/email/delivery-monitor';
import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import { createConfiguredEmailSender } from '@/features/notifications/email/factory';
import {
  getEmailNotificationDeliveryLedgerKeys,
  getEmailNotificationDeliveryRunDefinition,
} from '@/features/notifications/email/workflows/email-notification-delivery.types';
import { EnvValidationError } from '@/lib/config/env/shared';
import { summarizeEmailNotificationDeliveriesForRun } from '@/lib/db/queries/email-notification-deliveries';
import {
  attachEmailNotificationDeliveryRunMonitorCheckIn,
  claimEmailNotificationDeliveryRun,
  completeEmailNotificationDeliveryRun,
  failEmailNotificationDeliveryRun,
  loadEmailNotificationDeliveryRun,
  markEmailNotificationDeliveryRunNeedsReview,
  pauseEmailNotificationDeliveryRun,
  recordEmailNotificationDeliveryRunRetry,
  advanceEmailNotificationDeliveryRun,
} from '@/lib/db/queries/email-notification-delivery-runs';
import { logger } from '@/lib/logging/logger';
import { countMetric } from '@/lib/observability/metrics';
import { db as serviceRoleDb } from '@supabase/service-role';
import {
  FatalError,
  getStepMetadata,
  getWorkflowMetadata,
  RetryableError,
} from 'workflow';

const EMAIL_NOTIFICATION_DELIVERY_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 60 * 1000;

function logRunEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  input: EmailNotificationDeliveryWorkflowInput,
  workflowRunId: string,
  fields: Record<string, unknown> = {},
): void {
  logger[level](
    {
      source: 'email_notifications',
      event,
      runId: input.runId,
      workflowRunId,
      ...fields,
    },
    `Email notification delivery ${event.replaceAll('_', ' ')}`,
  );
}

function finishMonitor(
  run: {
    runKind: 'daily' | 'weekly';
    monitorCheckInId: string | null;
  },
  status: 'ok' | 'error',
): void {
  if (!run.monitorCheckInId) {
    return;
  }
  try {
    finishEmailNotificationDeliveryMonitor({
      runKind: run.runKind,
      checkInId: run.monitorCheckInId,
      status,
    });
  } catch {
    // Monitoring must not change email delivery state after it is terminal.
  }
}

async function terminalizeFailedRun(
  input: EmailNotificationDeliveryWorkflowInput,
  workflowRunId: string,
  errorClass: string,
  errorMessage: string,
): Promise<void> {
  const run = await loadEmailNotificationDeliveryRun(
    input.runId,
    serviceRoleDb,
  );
  if (!run) {
    throw new FatalError('Email delivery run was not found');
  }

  const transition = await failEmailNotificationDeliveryRun(
    {
      runId: input.runId,
      workflowRunId:
        run.status === 'queued' && run.workflowRunId === null
          ? null
          : workflowRunId,
      errorClass,
      errorMessage,
    },
    serviceRoleDb,
  );
  if (transition.outcome === 'transitioned') {
    finishMonitor(run, 'error');
    countMetric('atlaris.email.notification.run.failed', 1, {
      attributes: { kind: run.runKind, reason: errorClass },
    });
    logRunEvent('error', 'run_failed', input, workflowRunId, {
      runKind: run.runKind,
      errorClass,
    });
  }
}

async function retryOrFail(
  input: EmailNotificationDeliveryWorkflowInput,
  workflowRunId: string,
  errorClass: string,
  retryAfterMs: number,
): Promise<{ kind: 'in_flight' }> {
  const attempt = getStepMetadata().attempt;
  if (attempt > EMAIL_NOTIFICATION_DELIVERY_MAX_RETRIES) {
    await terminalizeFailedRun(
      input,
      workflowRunId,
      'retry_exhausted',
      'Email delivery page retries were exhausted.',
    );
    throw new FatalError('Email delivery page retry limit exhausted');
  }

  const retry = await recordEmailNotificationDeliveryRunRetry(
    {
      runId: input.runId,
      workflowRunId,
      errorClass,
      errorMessage: 'Email delivery page retry is scheduled.',
    },
    serviceRoleDb,
  );
  if (retry.outcome === 'stale') {
    return { kind: 'in_flight' };
  }

  countMetric('atlaris.email.notification.run.retry_scheduled', 1, {
    attributes: { reason: errorClass },
  });
  logRunEvent('warn', 'retry_scheduled', input, workflowRunId, {
    errorClass,
    attempt,
  });
  throw new RetryableError('Email delivery page retry scheduled', {
    retryAfter: retryAfterMs,
  });
}

async function retryClaimOrFail(
  input: EmailNotificationDeliveryWorkflowInput,
  workflowRunId: string,
): Promise<never> {
  const attempt = getStepMetadata().attempt;
  if (attempt > EMAIL_NOTIFICATION_DELIVERY_MAX_RETRIES) {
    await terminalizeFailedRun(
      input,
      workflowRunId,
      'claim_retry_exhausted',
      'Email delivery run claim retries were exhausted.',
    );
    throw new FatalError('Email delivery run claim retry limit exhausted');
  }

  logRunEvent('warn', 'claim_retry_scheduled', input, workflowRunId, {
    attempt,
  });
  throw new RetryableError('Email delivery run claim retry scheduled', {
    retryAfter: Math.max(DEFAULT_RETRY_DELAY_MS, attempt ** 2 * 1000),
  });
}

export async function claimEmailNotificationDeliveryRunStep(
  input: EmailNotificationDeliveryWorkflowInput,
): Promise<EmailNotificationDeliveryWorkflowClaimResult> {
  'use step';

  const { workflowRunId } = getWorkflowMetadata();
  try {
    const claim = await claimEmailNotificationDeliveryRun(
      { runId: input.runId, workflowRunId },
      serviceRoleDb,
    );
    if (claim.outcome === 'in_flight') {
      return { kind: 'in_flight' };
    }
    if (claim.outcome === 'terminal') {
      return { kind: 'terminal' };
    }

    if (!claim.run.monitorCheckInId) {
      let monitorCheckInId: string;
      try {
        monitorCheckInId = startEmailNotificationDeliveryMonitor(
          claim.run.runKind,
        );
      } catch {
        logRunEvent('error', 'monitor_start_failed', input, workflowRunId, {
          runKind: claim.run.runKind,
        });
        monitorCheckInId = '';
      }
      if (monitorCheckInId) {
        try {
          const attached =
            await attachEmailNotificationDeliveryRunMonitorCheckIn(
              { runId: claim.run.id, workflowRunId, monitorCheckInId },
              serviceRoleDb,
            );
          if (attached.outcome === 'already_attached') {
            // A stale replay created an extra Sentry check-in after another attempt
            // persisted the winning ID. Close ours so it cannot remain in progress.
            finishEmailNotificationDeliveryMonitor({
              runKind: claim.run.runKind,
              checkInId: monitorCheckInId,
              status: 'ok',
            });
          }
        } catch {
          // Do not leave an unattached check-in open when persistence retries.
          finishEmailNotificationDeliveryMonitor({
            runKind: claim.run.runKind,
            checkInId: monitorCheckInId,
            status: 'error',
          });
          throw new Error(
            'Email delivery monitor check-in could not be persisted',
          );
        }
      }
    }

    logRunEvent('info', 'run_claimed', input, workflowRunId, {
      runKind: claim.run.runKind,
    });
    return { kind: 'claimed' };
  } catch (error) {
    if (error instanceof RetryableError || error instanceof FatalError) {
      throw error;
    }
    return retryClaimOrFail(input, workflowRunId);
  }
}

export async function processEmailNotificationDeliveryPageStep(
  input: EmailNotificationDeliveryWorkflowInput,
): Promise<EmailNotificationDeliveryWorkflowPageResult> {
  'use step';

  const { workflowRunId } = getWorkflowMetadata();
  try {
    const run = await loadEmailNotificationDeliveryRun(
      input.runId,
      serviceRoleDb,
    );
    if (
      !run ||
      run.status !== 'running' ||
      run.workflowRunId !== workflowRunId
    ) {
      return { kind: 'in_flight' };
    }
    if (run.scanCompletedAt) {
      return { kind: 'page_processed', nextCursor: null };
    }

    if (!(await resolveEmailNotificationDeliveryEnabled())) {
      const paused = await pauseEmailNotificationDeliveryRun(
        {
          runId: run.id,
          workflowRunId,
          reason: 'delivery_flag_disabled',
        },
        serviceRoleDb,
      );
      if (paused.outcome === 'transitioned') {
        logRunEvent('info', 'run_paused', input, workflowRunId, {
          runKind: run.runKind,
        });
        return { kind: 'paused' };
      }
      return { kind: 'in_flight' };
    }

    const definition = getEmailNotificationDeliveryRunDefinition(run.runKind);
    const result = await runEmailNotificationDelivery(
      {
        categories: [...definition.categories],
        schedulerDateUtc: run.schedulerDateUtc,
        cursorUserId: run.cursorUserId,
      },
      {
        sender: createConfiguredEmailSender(),
        logger,
        now: run.referenceTimestampUtc,
        deliveryNow: new Date(),
      },
    );

    if (result.pageFailure?.kind === 'terminal') {
      await terminalizeFailedRun(
        input,
        workflowRunId,
        result.pageFailure.failureClass,
        'Email delivery page failed with a terminal provider or configuration error.',
      );
      throw new FatalError('Email delivery page failed permanently');
    }
    if (result.pageFailure?.kind === 'retryable') {
      return retryOrFail(
        input,
        workflowRunId,
        result.pageFailure.failureClass,
        result.pageFailure.retryAfterMs,
      );
    }

    const advanced = await advanceEmailNotificationDeliveryRun(
      {
        runId: run.id,
        workflowRunId,
        expectedCursorUserId: run.cursorUserId,
        nextCursorUserId: result.nextCursor,
        counts: result,
      },
      serviceRoleDb,
    );
    if (advanced.outcome === 'stale') {
      return { kind: 'in_flight' };
    }

    countMetric('atlaris.email.notification.run.page_completed', 1, {
      attributes: { kind: run.runKind },
    });
    logRunEvent('info', 'page_completed', input, workflowRunId, {
      runKind: run.runKind,
    });
    return { kind: 'page_processed', nextCursor: result.nextCursor };
  } catch (error) {
    if (error instanceof RetryableError || error instanceof FatalError) {
      throw error;
    }
    if (error instanceof EnvValidationError) {
      await terminalizeFailedRun(
        input,
        workflowRunId,
        'email_configuration',
        'Email delivery configuration is invalid.',
      );
      throw new FatalError('Email delivery configuration is invalid');
    }
    return retryOrFail(
      input,
      workflowRunId,
      'page_processing_error',
      Math.max(DEFAULT_RETRY_DELAY_MS, getStepMetadata().attempt ** 2 * 1000),
    );
  }
}

async function finalizeEmailNotificationDeliveryRun(
  input: EmailNotificationDeliveryWorkflowInput,
  workflowRunId: string,
): Promise<EmailNotificationDeliveryWorkflowTerminalResult> {
  const run = await loadEmailNotificationDeliveryRun(
    input.runId,
    serviceRoleDb,
  );
  if (!run) {
    throw new FatalError('Email delivery run was not found');
  }
  if (run.status !== 'running' || run.workflowRunId !== workflowRunId) {
    return { kind: 'in_flight' };
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
    serviceRoleDb,
  );
  if (
    run.recipientErrors > 0 ||
    run.manualReview > 0 ||
    ledgerSummary.manualReview > 0
  ) {
    const reviewed = await markEmailNotificationDeliveryRunNeedsReview(
      {
        runId: run.id,
        workflowRunId,
        errorClass: 'recipient_or_delivery_review_required',
        errorMessage:
          'Email delivery completed with recipient or provider review required.',
        ledgerSummary,
      },
      serviceRoleDb,
    );
    if (reviewed.outcome === 'transitioned') {
      finishMonitor(run, 'error');
      countMetric('atlaris.email.notification.run.needs_review', 1, {
        attributes: { kind: run.runKind },
      });
      logRunEvent('warn', 'run_needs_review', input, workflowRunId, {
        runKind: run.runKind,
      });
    }
    throw new FatalError('Email delivery requires manual review');
  }

  const completed = await completeEmailNotificationDeliveryRun(
    { runId: run.id, workflowRunId, ledgerSummary },
    serviceRoleDb,
  );
  if (completed.outcome === 'stale') {
    return { kind: 'in_flight' };
  }

  finishMonitor(run, 'ok');
  countMetric('atlaris.email.notification.run.completed', 1, {
    attributes: { kind: run.runKind },
  });
  logRunEvent('info', 'run_completed', input, workflowRunId, {
    runKind: run.runKind,
  });
  return { kind: 'completed' };
}

export async function finalizeEmailNotificationDeliveryRunStep(
  input: EmailNotificationDeliveryWorkflowInput,
): Promise<EmailNotificationDeliveryWorkflowTerminalResult> {
  'use step';

  const { workflowRunId } = getWorkflowMetadata();
  try {
    return await finalizeEmailNotificationDeliveryRun(input, workflowRunId);
  } catch (error) {
    if (error instanceof FatalError || error instanceof RetryableError) {
      throw error;
    }
    return retryOrFail(
      input,
      workflowRunId,
      'finalization_error',
      Math.max(DEFAULT_RETRY_DELAY_MS, getStepMetadata().attempt ** 2 * 1000),
    );
  }
}

processEmailNotificationDeliveryPageStep.maxRetries =
  EMAIL_NOTIFICATION_DELIVERY_MAX_RETRIES;
