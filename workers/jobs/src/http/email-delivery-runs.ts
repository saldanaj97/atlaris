import type { JobSwitchVars } from '../env';
import type { EmailDeliveryWorkflowParams } from '../workflows/email-delivery/run';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import { isJobEnabled, isJobsPaused } from '../switches';
import {
  createEmailNotificationDeliveryReferenceTimestamp,
  getEmailNotificationDeliveryLedgerKeys,
  getEmailNotificationDeliveryRunDefinition,
  isEmailNotificationDeliveryWeeklyDate,
} from '@/features/notifications/email/workflows/email-notification-delivery.types';
import { countEmailNotificationDeliveryManualReviews } from '@/lib/db/queries/email-notification-deliveries';
import {
  type EmailNotificationDeliveryRun,
  failEmailNotificationDeliveryRun,
  loadEmailNotificationDeliveryRunByKey,
  prepareEmailNotificationDeliveryRunResume,
  reserveEmailNotificationDeliveryRun,
} from '@/lib/db/queries/email-notification-delivery-runs';
import { z } from 'zod';

export const EMAIL_DELIVERY_RUNS_PATH = '/v1/email-delivery/runs';

const commandSchema = z.strictObject({
  v: z.literal(1),
  runKind: z.enum(['daily', 'weekly']),
  schedulerDateUtc: z.iso.date(),
  action: z.enum(['start', 'resume', 'replay_reviewed']),
});

export type EmailDeliveryRunsCommand = z.infer<typeof commandSchema>;

export type EmailDeliveryRunsDeps = {
  switches: JobSwitchVars;
  withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  workflow: Pick<Workflow<EmailDeliveryWorkflowParams>, 'create' | 'get'>;
  logger: Pick<Logger, 'info' | 'error'>;
  now?: () => Date;
};

type PreparedRun =
  | { kind: 'ready'; run: EmailNotificationDeliveryRun }
  | { kind: 'existing'; run: EmailNotificationDeliveryRun }
  | { kind: 'invalid_state' };

/**
 * Deterministic per run state: a repeated command for the same queued run
 * maps to the same instance, and each resume gets a new one.
 */
export function emailDeliveryInstanceId(
  run: Pick<EmailNotificationDeliveryRun, 'id' | 'updatedAt'>,
): string {
  return `email-${run.id}-${run.updatedAt.getTime()}`;
}

function parseCommand(
  body: unknown,
  now: Date,
): EmailDeliveryRunsCommand | null {
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const command = parsed.data;
  if (
    command.runKind === 'weekly' &&
    !isEmailNotificationDeliveryWeeklyDate(command.schedulerDateUtc)
  ) {
    return null;
  }
  if (
    command.action === 'start' &&
    command.schedulerDateUtc > now.toISOString().slice(0, 10)
  ) {
    return null;
  }
  return command;
}

/** Same state rules as the app's `startEmailNotificationDeliveryWorkflow`. */
async function prepareRun(
  command: EmailDeliveryRunsCommand,
  db: DbClient,
): Promise<PreparedRun> {
  if (command.action === 'start') {
    const reservation = await reserveEmailNotificationDeliveryRun(
      {
        runKind: command.runKind,
        schedulerDateUtc: command.schedulerDateUtc,
        referenceTimestampUtc:
          createEmailNotificationDeliveryReferenceTimestamp(
            command.runKind,
            command.schedulerDateUtc,
          ),
      },
      db,
    );
    const unclaimedQueued =
      reservation.run.status === 'queued' &&
      reservation.run.workflowRunId === null;
    return reservation.outcome === 'reserved' || unclaimedQueued
      ? { kind: 'ready', run: reservation.run }
      : { kind: 'existing', run: reservation.run };
  }

  const existing = await loadEmailNotificationDeliveryRunByKey(command, db);
  if (!existing) {
    return { kind: 'invalid_state' };
  }
  if (
    command.action === 'replay_reviewed' &&
    existing.status === 'needs_review'
  ) {
    const unresolvedManualReviews =
      await countEmailNotificationDeliveryManualReviews(
        {
          categories: getEmailNotificationDeliveryRunDefinition(
            existing.runKind,
          ).categories,
          deliveryKeys: getEmailNotificationDeliveryLedgerKeys(
            existing.runKind,
            existing.schedulerDateUtc,
          ),
        },
        db,
      );
    if (unresolvedManualReviews > 0) {
      return { kind: 'existing', run: existing };
    }
  }

  const prepared = await prepareEmailNotificationDeliveryRunResume(
    { runId: existing.id, action: command.action },
    db,
  );
  return prepared.outcome === 'prepared'
    ? { kind: 'ready', run: prepared.run }
    : { kind: 'invalid_state' };
}

async function instanceExists(
  workflow: EmailDeliveryRunsDeps['workflow'],
  instanceId: string,
): Promise<boolean> {
  try {
    await workflow.get(instanceId);
    return true;
  } catch {
    return false;
  }
}

/**
 * `POST /v1/email-delivery/runs`: manual `start`, `resume`, or
 * `replay_reviewed` for one logical run (design note, Decision 4). The router
 * verifies the request signature before calling this handler.
 */
export async function handleEmailDeliveryRunsCommand(
  request: Request,
  deps: EmailDeliveryRunsDeps,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const command = parseCommand(body, deps.now?.() ?? new Date());
  if (!command) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (isJobsPaused(deps.switches)) {
    return Response.json({ code: 'jobs_paused' }, { status: 503 });
  }
  if (!isJobEnabled(deps.switches, 'EMAIL_DELIVERY')) {
    return Response.json({ code: 'job_disabled' }, { status: 503 });
  }

  const prepared = await deps.withDb((db) => prepareRun(command, db));
  if (prepared.kind === 'invalid_state') {
    return Response.json({ code: 'invalid_run_state' }, { status: 409 });
  }
  const { run } = prepared;
  if (prepared.kind === 'existing') {
    return Response.json({
      accepted: true,
      duplicate: true,
      runId: run.id,
      status: run.status,
    });
  }

  const instanceId = emailDeliveryInstanceId(run);
  const fields = {
    source: 'email_notifications',
    event: 'manual_command',
    runId: run.id,
    runKind: run.runKind,
    action: command.action,
    instanceId,
  };
  try {
    await deps.workflow.create({
      id: instanceId,
      params: { v: 1, runId: run.id },
    });
  } catch {
    if (await instanceExists(deps.workflow, instanceId)) {
      return Response.json({
        accepted: true,
        duplicate: true,
        runId: run.id,
        instanceId,
      });
    }
    await deps.withDb((db) =>
      failEmailNotificationDeliveryRun(
        {
          runId: run.id,
          workflowRunId: null,
          errorClass: 'workflow_start_failed',
          errorMessage: 'Email delivery workflow could not be started.',
        },
        db,
      ),
    );
    deps.logger.error(
      fields,
      'Email notification delivery workflow could not be started',
    );
    return Response.json({ code: 'workflow_start_failed' }, { status: 503 });
  }

  deps.logger.info(fields, 'Email notification delivery workflow started');
  return Response.json(
    { accepted: true, instanceId, runId: run.id },
    { status: 202 },
  );
}
