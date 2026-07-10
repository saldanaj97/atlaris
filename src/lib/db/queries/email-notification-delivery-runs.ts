import type { EmailDeliveryRunCounts } from '@/features/notifications/email/types';
import type { EmailNotificationDeliveryLedgerSummary } from '@/lib/db/queries/email-notification-deliveries';
import type { DbClient } from '@/lib/db/types';
import type {
  EmailNotificationDeliveryRunKind,
  EmailNotificationDeliveryRunStatus,
} from '@supabase/schema';

import { emailNotificationDeliveryRuns } from '@supabase/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

type DeliveryRunDb = Pick<DbClient, 'insert' | 'select' | 'update'>;

export type EmailNotificationDeliveryRunCounts = Omit<
  EmailDeliveryRunCounts,
  'nextCursor'
> & {
  recipientErrors: number;
};

export type EmailNotificationDeliveryRun =
  typeof emailNotificationDeliveryRuns.$inferSelect;

export type ReserveEmailNotificationDeliveryRunResult =
  | { outcome: 'reserved'; run: EmailNotificationDeliveryRun }
  | { outcome: 'existing'; run: EmailNotificationDeliveryRun };

export type ClaimEmailNotificationDeliveryRunResult =
  | { outcome: 'claimed'; run: EmailNotificationDeliveryRun }
  | { outcome: 'in_flight'; run: EmailNotificationDeliveryRun }
  | { outcome: 'terminal'; run: EmailNotificationDeliveryRun };

type RunTerminalStatus = Extract<
  EmailNotificationDeliveryRunStatus,
  'completed' | 'failed' | 'needs_review'
>;

function cursorMatches(cursorUserId: string | null) {
  return cursorUserId === null
    ? isNull(emailNotificationDeliveryRuns.cursorUserId)
    : eq(emailNotificationDeliveryRuns.cursorUserId, cursorUserId);
}

function zeroCounts() {
  return {
    pagesCompleted: 0,
    examined: 0,
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    alreadyTerminal: 0,
    inFlight: 0,
    manualReview: 0,
    recipientErrors: 0,
  };
}

export async function reserveEmailNotificationDeliveryRun(
  args: {
    runKind: EmailNotificationDeliveryRunKind;
    schedulerDateUtc: string;
    referenceTimestampUtc: Date;
    now?: Date;
  },
  dbClient: DeliveryRunDb,
): Promise<ReserveEmailNotificationDeliveryRunResult> {
  const now = args.now ?? new Date();
  const inserted = await dbClient
    .insert(emailNotificationDeliveryRuns)
    .values({
      runKind: args.runKind,
      schedulerDateUtc: args.schedulerDateUtc,
      referenceTimestampUtc: args.referenceTimestampUtc,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        emailNotificationDeliveryRuns.runKind,
        emailNotificationDeliveryRuns.schedulerDateUtc,
      ],
    })
    .returning();

  if (inserted[0]) {
    return { outcome: 'reserved', run: inserted[0] };
  }

  const [existing] = await dbClient
    .select()
    .from(emailNotificationDeliveryRuns)
    .where(
      and(
        eq(emailNotificationDeliveryRuns.runKind, args.runKind),
        eq(
          emailNotificationDeliveryRuns.schedulerDateUtc,
          args.schedulerDateUtc,
        ),
      ),
    );

  if (!existing) {
    throw new Error('Email delivery run missing after reservation conflict');
  }

  return { outcome: 'existing', run: existing };
}

export async function loadEmailNotificationDeliveryRun(
  runId: string,
  dbClient: Pick<DbClient, 'select'>,
): Promise<EmailNotificationDeliveryRun | null> {
  const [run] = await dbClient
    .select()
    .from(emailNotificationDeliveryRuns)
    .where(eq(emailNotificationDeliveryRuns.id, runId));
  return run ?? null;
}

export async function loadEmailNotificationDeliveryRunByKey(
  args: {
    runKind: EmailNotificationDeliveryRunKind;
    schedulerDateUtc: string;
  },
  dbClient: Pick<DbClient, 'select'>,
): Promise<EmailNotificationDeliveryRun | null> {
  const [run] = await dbClient
    .select()
    .from(emailNotificationDeliveryRuns)
    .where(
      and(
        eq(emailNotificationDeliveryRuns.runKind, args.runKind),
        eq(
          emailNotificationDeliveryRuns.schedulerDateUtc,
          args.schedulerDateUtc,
        ),
      ),
    );
  return run ?? null;
}

/**
 * Claims a queued run for one Workflow SDK run. Replays by the same workflow
 * are accepted; all other owners are rejected without modifying state.
 */
export async function attachEmailNotificationWorkflowRun(
  args: { runId: string; workflowRunId: string; now?: Date },
  dbClient: DeliveryRunDb,
): Promise<ClaimEmailNotificationDeliveryRunResult> {
  const now = args.now ?? new Date();
  const claimed = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      status: 'running',
      workflowRunId: args.workflowRunId,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        eq(emailNotificationDeliveryRuns.status, 'queued'),
        isNull(emailNotificationDeliveryRuns.workflowRunId),
      ),
    )
    .returning();

  if (claimed[0]) {
    return { outcome: 'claimed', run: claimed[0] };
  }

  const current = await loadEmailNotificationDeliveryRun(args.runId, dbClient);
  if (!current) {
    throw new Error('Email delivery run missing while claiming workflow');
  }

  if (
    current.status === 'running' &&
    current.workflowRunId === args.workflowRunId
  ) {
    return { outcome: 'claimed', run: current };
  }

  if (
    current.status === 'completed' ||
    current.status === 'failed' ||
    current.status === 'needs_review'
  ) {
    return { outcome: 'terminal', run: current };
  }

  return { outcome: 'in_flight', run: current };
}

/**
 * Claims a queued run from inside its Workflow SDK entrypoint. The workflow
 * step attaches its own ID; accepting the same ID makes step replays
 * idempotent and closes the start-to-first-step race.
 */
export const claimEmailNotificationDeliveryRun =
  attachEmailNotificationWorkflowRun;

export async function attachEmailNotificationDeliveryRunMonitorCheckIn(
  args: {
    runId: string;
    workflowRunId: string;
    monitorCheckInId: string;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'select' | 'update'>,
): Promise<{
  outcome: 'attached' | 'already_attached';
  monitorCheckInId: string | null;
}> {
  const updated = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      monitorCheckInId: args.monitorCheckInId,
      updatedAt: args.now ?? new Date(),
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        eq(emailNotificationDeliveryRuns.status, 'running'),
        eq(emailNotificationDeliveryRuns.workflowRunId, args.workflowRunId),
        isNull(emailNotificationDeliveryRuns.monitorCheckInId),
      ),
    )
    .returning({ id: emailNotificationDeliveryRuns.id });

  if (updated[0]) {
    return { outcome: 'attached', monitorCheckInId: args.monitorCheckInId };
  }

  const current = await loadEmailNotificationDeliveryRun(args.runId, dbClient);
  if (!current) {
    throw new Error(
      'Email delivery run missing while attaching monitor check-in',
    );
  }
  return {
    outcome: 'already_attached',
    monitorCheckInId: current.monitorCheckInId,
  };
}

export async function recordEmailNotificationDeliveryRunRetry(
  args: {
    runId: string;
    workflowRunId: string;
    errorClass: string;
    errorMessage: string;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<{ outcome: 'recorded' | 'stale' }> {
  const updated = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      lastErrorClass: args.errorClass,
      lastErrorMessage: args.errorMessage,
      updatedAt: args.now ?? new Date(),
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        eq(emailNotificationDeliveryRuns.status, 'running'),
        eq(emailNotificationDeliveryRuns.workflowRunId, args.workflowRunId),
      ),
    )
    .returning({ id: emailNotificationDeliveryRuns.id });

  return updated[0] ? { outcome: 'recorded' } : { outcome: 'stale' };
}

/**
 * Advances exactly one completed page. The workflow ID and previous cursor are
 * both compared so stale/reclaimed workflow attempts cannot double-count work.
 */
export async function advanceEmailNotificationDeliveryRun(
  args: {
    runId: string;
    workflowRunId: string;
    expectedCursorUserId: string | null;
    nextCursorUserId: string | null;
    counts: EmailNotificationDeliveryRunCounts;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<{ outcome: 'advanced' | 'stale' }> {
  const now = args.now ?? new Date();
  const updated = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      cursorUserId: args.nextCursorUserId,
      scanCompletedAt: args.nextCursorUserId === null ? now : null,
      pagesCompleted: sql`${emailNotificationDeliveryRuns.pagesCompleted} + 1`,
      examined: sql`${emailNotificationDeliveryRuns.examined} + ${args.counts.examined}`,
      claimed: sql`${emailNotificationDeliveryRuns.claimed} + ${args.counts.claimed}`,
      sent: sql`${emailNotificationDeliveryRuns.sent} + ${args.counts.sent}`,
      skipped: sql`${emailNotificationDeliveryRuns.skipped} + ${args.counts.skipped}`,
      failed: sql`${emailNotificationDeliveryRuns.failed} + ${args.counts.failed}`,
      alreadyTerminal: sql`${emailNotificationDeliveryRuns.alreadyTerminal} + ${args.counts.alreadyTerminal}`,
      inFlight: sql`${emailNotificationDeliveryRuns.inFlight} + ${args.counts.inFlight}`,
      manualReview: sql`${emailNotificationDeliveryRuns.manualReview} + ${args.counts.manualReview}`,
      recipientErrors: sql`${emailNotificationDeliveryRuns.recipientErrors} + ${args.counts.recipientErrors}`,
      lastErrorClass: null,
      lastErrorMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        eq(emailNotificationDeliveryRuns.status, 'running'),
        eq(emailNotificationDeliveryRuns.workflowRunId, args.workflowRunId),
        cursorMatches(args.expectedCursorUserId),
      ),
    )
    .returning({ id: emailNotificationDeliveryRuns.id });

  return updated[0] ? { outcome: 'advanced' } : { outcome: 'stale' };
}

async function transitionOwnedEmailNotificationDeliveryRun(
  args: {
    runId: string;
    workflowRunId: string;
    status: RunTerminalStatus | 'paused';
    lastErrorClass?: string | null;
    lastErrorMessage?: string | null;
    ledgerSummary?: EmailNotificationDeliveryLedgerSummary;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<{ outcome: 'transitioned' | 'stale' }> {
  const now = args.now ?? new Date();
  const updated = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      status: args.status,
      lastErrorClass: args.lastErrorClass ?? null,
      lastErrorMessage: args.lastErrorMessage ?? null,
      ...(args.ledgerSummary
        ? {
            sent: args.ledgerSummary.sent,
            skipped: args.ledgerSummary.skipped,
            manualReview: args.ledgerSummary.manualReview,
          }
        : {}),
      ...(args.status === 'paused' ? {} : { completedAt: now }),
      updatedAt: now,
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        eq(emailNotificationDeliveryRuns.status, 'running'),
        eq(emailNotificationDeliveryRuns.workflowRunId, args.workflowRunId),
      ),
    )
    .returning({ id: emailNotificationDeliveryRuns.id });

  return updated[0] ? { outcome: 'transitioned' } : { outcome: 'stale' };
}

export async function completeEmailNotificationDeliveryRun(
  args: {
    runId: string;
    workflowRunId: string;
    ledgerSummary: EmailNotificationDeliveryLedgerSummary;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
) {
  return transitionOwnedEmailNotificationDeliveryRun(
    { ...args, status: 'completed' },
    dbClient,
  );
}

export async function pauseEmailNotificationDeliveryRun(
  args: {
    runId: string;
    workflowRunId: string;
    reason: string;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
) {
  return transitionOwnedEmailNotificationDeliveryRun(
    {
      ...args,
      status: 'paused',
      lastErrorClass: args.reason,
      lastErrorMessage: 'Email delivery was paused by the delivery flag.',
    },
    dbClient,
  );
}

export async function failEmailNotificationDeliveryRun(
  args: {
    runId: string;
    workflowRunId: string | null;
    errorClass: string;
    errorMessage: string;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
): Promise<{ outcome: 'transitioned' | 'stale' }> {
  if (args.workflowRunId !== null) {
    return transitionOwnedEmailNotificationDeliveryRun(
      {
        ...args,
        workflowRunId: args.workflowRunId,
        status: 'failed',
        lastErrorClass: args.errorClass,
        lastErrorMessage: args.errorMessage,
      },
      dbClient,
    );
  }

  const now = args.now ?? new Date();
  const updated = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      status: 'failed',
      lastErrorClass: args.errorClass,
      lastErrorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        eq(emailNotificationDeliveryRuns.status, 'queued'),
        isNull(emailNotificationDeliveryRuns.workflowRunId),
      ),
    )
    .returning({ id: emailNotificationDeliveryRuns.id });

  return updated[0] ? { outcome: 'transitioned' } : { outcome: 'stale' };
}

export async function markEmailNotificationDeliveryRunNeedsReview(
  args: {
    runId: string;
    workflowRunId: string;
    errorClass: string;
    errorMessage: string;
    ledgerSummary: EmailNotificationDeliveryLedgerSummary;
    now?: Date;
  },
  dbClient: Pick<DbClient, 'update'>,
) {
  return transitionOwnedEmailNotificationDeliveryRun(
    {
      ...args,
      status: 'needs_review',
      lastErrorClass: args.errorClass,
      lastErrorMessage: args.errorMessage,
    },
    dbClient,
  );
}

export async function prepareEmailNotificationDeliveryRunResume(
  args: {
    runId: string;
    action: 'resume' | 'replay_reviewed';
    now?: Date;
  },
  dbClient: DeliveryRunDb,
): Promise<{
  outcome: 'prepared' | 'invalid_state';
  run: EmailNotificationDeliveryRun;
}> {
  const now = args.now ?? new Date();
  const expectedStatuses =
    args.action === 'resume'
      ? (['failed', 'paused'] as const)
      : (['needs_review'] as const);
  const updated = await dbClient
    .update(emailNotificationDeliveryRuns)
    .set({
      status: 'queued',
      workflowRunId: null,
      // A paused run is non-terminal, so its monitor stays in progress across
      // a resume. Failed/reviewed work begins a new monitor lifecycle.
      monitorCheckInId:
        args.action === 'resume'
          ? sql`CASE WHEN ${emailNotificationDeliveryRuns.status} = 'paused' THEN ${emailNotificationDeliveryRuns.monitorCheckInId} ELSE NULL END`
          : null,
      startedAt: null,
      completedAt: null,
      lastErrorClass: null,
      lastErrorMessage: null,
      ...(args.action === 'replay_reviewed'
        ? { cursorUserId: null, scanCompletedAt: null, ...zeroCounts() }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(emailNotificationDeliveryRuns.id, args.runId),
        inArray(emailNotificationDeliveryRuns.status, expectedStatuses),
      ),
    )
    .returning();

  if (updated[0]) {
    return { outcome: 'prepared', run: updated[0] };
  }

  const run = await loadEmailNotificationDeliveryRun(args.runId, dbClient);
  if (!run) {
    throw new Error('Email delivery run missing while preparing resume');
  }
  return { outcome: 'invalid_state', run };
}
