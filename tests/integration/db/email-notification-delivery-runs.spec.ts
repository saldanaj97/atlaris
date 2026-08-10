import {
  advanceEmailNotificationDeliveryRun,
  attachEmailNotificationDeliveryRunMonitorCheckIn,
  claimEmailNotificationDeliveryRun,
  failEmailNotificationDeliveryRun,
  loadEmailNotificationDeliveryRun,
  pauseEmailNotificationDeliveryRun,
  prepareEmailNotificationDeliveryRunResume,
  reserveEmailNotificationDeliveryRun,
} from '@/lib/db/queries/email-notification-delivery-runs';
import { emailNotificationDeliveryRuns } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const REFERENCE_TIMESTAMP = new Date('2026-07-10T14:00:00.000Z');

describe('email notification delivery runs', () => {
  it('reserves one logical daily run under concurrent requests', async () => {
    const [first, second] = await Promise.all([
      reserveEmailNotificationDeliveryRun(
        {
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          referenceTimestampUtc: REFERENCE_TIMESTAMP,
        },
        db,
      ),
      reserveEmailNotificationDeliveryRun(
        {
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          referenceTimestampUtc: REFERENCE_TIMESTAMP,
        },
        db,
      ),
    ]);

    expect([first.outcome, second.outcome].toSorted()).toEqual([
      'existing',
      'reserved',
    ]);

    const rows = await db
      .select()
      .from(emailNotificationDeliveryRuns)
      .where(eq(emailNotificationDeliveryRuns.schedulerDateUtc, '2026-07-10'));
    expect(rows).toHaveLength(1);
  });

  it('retains the logical cursor and reference timestamp when a failed run resumes', async () => {
    const reservation = await reserveEmailNotificationDeliveryRun(
      {
        runKind: 'weekly',
        schedulerDateUtc: '2026-07-13',
        referenceTimestampUtc: new Date('2026-07-13T14:30:00.000Z'),
      },
      db,
    );
    const workflowRunId = 'workflow-weekly-1';
    const cursorUserId = randomUUID();

    const claimed = await claimEmailNotificationDeliveryRun(
      { runId: reservation.run.id, workflowRunId },
      db,
    );
    expect(claimed.outcome).toBe('claimed');

    await expect(
      advanceEmailNotificationDeliveryRun(
        {
          runId: reservation.run.id,
          workflowRunId,
          expectedCursorUserId: null,
          nextCursorUserId: cursorUserId,
          counts: {
            examined: 50,
            claimed: 2,
            sent: 1,
            skipped: 1,
            failed: 0,
            alreadyTerminal: 0,
            inFlight: 0,
            manualReview: 0,
            recipientErrors: 0,
          },
        },
        db,
      ),
    ).resolves.toEqual({ outcome: 'advanced' });

    await failEmailNotificationDeliveryRun(
      {
        runId: reservation.run.id,
        workflowRunId,
        errorClass: 'provider_rate_limited',
        errorMessage: 'Provider rate limit while processing a page.',
      },
      db,
    );

    const prepared = await prepareEmailNotificationDeliveryRunResume(
      { runId: reservation.run.id, action: 'resume' },
      db,
    );
    expect(prepared.outcome).toBe('prepared');

    const persisted = await loadEmailNotificationDeliveryRun(
      reservation.run.id,
      db,
    );
    expect(persisted).toMatchObject({
      status: 'queued',
      cursorUserId,
      referenceTimestampUtc: new Date('2026-07-13T14:30:00.000Z'),
      pagesCompleted: 1,
    });
  });

  it('rejects page progress from a workflow that no longer owns the run', async () => {
    const reservation = await reserveEmailNotificationDeliveryRun(
      {
        runKind: 'daily',
        schedulerDateUtc: '2026-07-11',
        referenceTimestampUtc: new Date('2026-07-11T14:00:00.000Z'),
      },
      db,
    );
    await claimEmailNotificationDeliveryRun(
      { runId: reservation.run.id, workflowRunId: 'workflow-owner' },
      db,
    );

    await expect(
      advanceEmailNotificationDeliveryRun(
        {
          runId: reservation.run.id,
          workflowRunId: 'workflow-stale',
          expectedCursorUserId: null,
          nextCursorUserId: randomUUID(),
          counts: {
            examined: 50,
            claimed: 1,
            sent: 1,
            skipped: 0,
            failed: 0,
            alreadyTerminal: 0,
            inFlight: 0,
            manualReview: 0,
            recipientErrors: 0,
          },
        },
        db,
      ),
    ).resolves.toEqual({ outcome: 'stale' });

    const persisted = await loadEmailNotificationDeliveryRun(
      reservation.run.id,
      db,
    );
    expect(persisted).toMatchObject({
      status: 'running',
      workflowRunId: 'workflow-owner',
      pagesCompleted: 0,
      cursorUserId: null,
    });
  });

  it('only lets the owning workflow attach a monitor check-in', async () => {
    const reservation = await reserveEmailNotificationDeliveryRun(
      {
        runKind: 'daily',
        schedulerDateUtc: '2026-07-12',
        referenceTimestampUtc: new Date('2026-07-12T14:00:00.000Z'),
      },
      db,
    );
    await claimEmailNotificationDeliveryRun(
      { runId: reservation.run.id, workflowRunId: 'workflow-owner' },
      db,
    );

    await expect(
      attachEmailNotificationDeliveryRunMonitorCheckIn(
        {
          runId: reservation.run.id,
          workflowRunId: 'workflow-stale',
          monitorCheckInId: 'monitor-stale',
        },
        db,
      ),
    ).resolves.toEqual({
      outcome: 'already_attached',
      monitorCheckInId: null,
    });

    await expect(
      attachEmailNotificationDeliveryRunMonitorCheckIn(
        {
          runId: reservation.run.id,
          workflowRunId: 'workflow-owner',
          monitorCheckInId: 'monitor-owner',
        },
        db,
      ),
    ).resolves.toEqual({
      outcome: 'attached',
      monitorCheckInId: 'monitor-owner',
    });
  });

  it('persists a final-page checkpoint separately from the initial null cursor', async () => {
    const reservation = await reserveEmailNotificationDeliveryRun(
      {
        runKind: 'daily',
        schedulerDateUtc: '2026-07-14',
        referenceTimestampUtc: new Date('2026-07-14T14:00:00.000Z'),
      },
      db,
    );
    await claimEmailNotificationDeliveryRun(
      { runId: reservation.run.id, workflowRunId: 'workflow-final-page' },
      db,
    );

    await expect(
      advanceEmailNotificationDeliveryRun(
        {
          runId: reservation.run.id,
          workflowRunId: 'workflow-final-page',
          expectedCursorUserId: null,
          nextCursorUserId: null,
          counts: {
            examined: 1,
            claimed: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            alreadyTerminal: 0,
            inFlight: 0,
            manualReview: 0,
            recipientErrors: 0,
          },
        },
        db,
      ),
    ).resolves.toEqual({ outcome: 'advanced' });

    const persisted = await loadEmailNotificationDeliveryRun(
      reservation.run.id,
      db,
    );
    expect(persisted).toMatchObject({
      cursorUserId: null,
      pagesCompleted: 1,
    });
    expect(persisted?.scanCompletedAt).toBeInstanceOf(Date);
  });

  it('keeps a paused run monitor open across resume', async () => {
    const reservation = await reserveEmailNotificationDeliveryRun(
      {
        runKind: 'daily',
        schedulerDateUtc: '2026-07-15',
        referenceTimestampUtc: new Date('2026-07-15T14:00:00.000Z'),
      },
      db,
    );
    const workflowRunId = 'workflow-paused';
    await claimEmailNotificationDeliveryRun(
      { runId: reservation.run.id, workflowRunId },
      db,
    );
    await attachEmailNotificationDeliveryRunMonitorCheckIn(
      {
        runId: reservation.run.id,
        workflowRunId,
        monitorCheckInId: 'monitor-paused',
      },
      db,
    );
    await pauseEmailNotificationDeliveryRun(
      {
        runId: reservation.run.id,
        workflowRunId,
        reason: 'delivery_flag_disabled',
      },
      db,
    );

    const prepared = await prepareEmailNotificationDeliveryRunResume(
      { runId: reservation.run.id, action: 'resume' },
      db,
    );

    expect(prepared).toMatchObject({
      outcome: 'prepared',
      run: { status: 'queued', monitorCheckInId: 'monitor-paused' },
    });
  });
});
