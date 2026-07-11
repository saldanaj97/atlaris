import { advanceEmailNotificationDeliveryRun } from '@/lib/db/queries/email-notification-delivery-runs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

type MigrationJournal = {
  entries: Array<{ tag: string; when: number }>;
};

describe('advanceEmailNotificationDeliveryRun', () => {
  it('does not advance progress when the workflow no longer owns the persisted cursor', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const db = {
      update: vi
        .fn()
        .mockReturnValue({ set: vi.fn().mockReturnValue({ where }) }),
    } as never;

    const result = await advanceEmailNotificationDeliveryRun(
      {
        runId: 'run-1',
        workflowRunId: 'workflow-1',
        expectedCursorUserId: null,
        nextCursorUserId: 'user-50',
        counts: {
          examined: 50,
          claimed: 3,
          sent: 2,
          skipped: 1,
          failed: 0,
          alreadyTerminal: 0,
          inFlight: 0,
          manualReview: 0,
          recipientErrors: 0,
        },
      },
      db,
    );

    expect(result).toEqual({ outcome: 'stale' });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('keeps the delivery-run journal entry after the delivery ledger for upgrades', () => {
    const journal = JSON.parse(
      readFileSync(
        resolve(TEST_DIR, '../../../supabase/migrations/meta/_journal.json'),
        'utf8',
      ),
    ) as MigrationJournal;
    const deliveryLedgerEntry = journal.entries.find(
      (entry) =>
        entry.tag === '20260809190000_create_email_notification_deliveries',
    );
    const deliveryRunEntry = journal.entries.find(
      (entry) =>
        entry.tag === '20260710151930_create_email_notification_delivery_runs',
    );

    if (!deliveryLedgerEntry || !deliveryRunEntry) {
      throw new Error('Email delivery migration journal entries are required');
    }

    expect(journal.entries.indexOf(deliveryRunEntry)).toBeGreaterThan(
      journal.entries.indexOf(deliveryLedgerEntry),
    );
    expect(deliveryRunEntry.when).toBeGreaterThan(deliveryLedgerEntry.when);
  });

  it('deploys the generated historical migration with include-all', () => {
    for (const workflow of [
      '../../../.github/workflows/staging-db-migrations.yaml',
      '../../../.github/workflows/production-db-migrations.yaml',
    ]) {
      expect(readFileSync(resolve(TEST_DIR, workflow), 'utf8')).toContain(
        'supabase db push --include-all',
      );
    }
  });
});
