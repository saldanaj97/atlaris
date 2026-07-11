import { timestampFields } from '../helpers';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const emailNotificationDeliveryRunKind = pgEnum(
  'email_notification_delivery_run_kind',
  ['daily', 'weekly'],
);

export const emailNotificationDeliveryRunStatus = pgEnum(
  'email_notification_delivery_run_status',
  ['queued', 'running', 'paused', 'completed', 'failed', 'needs_review'],
);

export type EmailNotificationDeliveryRunKind =
  (typeof emailNotificationDeliveryRunKind.enumValues)[number];

export type EmailNotificationDeliveryRunStatus =
  (typeof emailNotificationDeliveryRunStatus.enumValues)[number];

/**
 * Durable, service-role-only orchestration state for one logical email pass.
 * The per-message delivery ledger remains authoritative for side effects.
 */
export const emailNotificationDeliveryRuns = pgTable(
  'email_notification_delivery_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runKind: emailNotificationDeliveryRunKind('run_kind').notNull(),
    schedulerDateUtc: date('scheduler_date_utc').notNull(),
    referenceTimestampUtc: timestamp('reference_timestamp_utc', {
      withTimezone: true,
    }).notNull(),
    status: emailNotificationDeliveryRunStatus('status')
      .notNull()
      .default('queued'),
    workflowRunId: text('workflow_run_id'),
    monitorCheckInId: text('monitor_check_in_id'),
    // No foreign key: deleting a user must not erase the keyset boundary.
    cursorUserId: uuid('cursor_user_id'),
    /** Set after the final cursor checkpoint so a replay proceeds to finalization. */
    scanCompletedAt: timestamp('scan_completed_at', { withTimezone: true }),
    pagesCompleted: integer('pages_completed').notNull().default(0),
    examined: integer('examined').notNull().default(0),
    claimed: integer('claimed').notNull().default(0),
    sent: integer('sent').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    alreadyTerminal: integer('already_terminal').notNull().default(0),
    inFlight: integer('in_flight').notNull().default(0),
    manualReview: integer('manual_review').notNull().default(0),
    recipientErrors: integer('recipient_errors').notNull().default(0),
    lastErrorClass: text('last_error_class'),
    lastErrorMessage: text('last_error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestampFields,
  },
  (table) => [
    unique('email_notification_delivery_runs_kind_date_unique').on(
      table.runKind,
      table.schedulerDateUtc,
    ),
    uniqueIndex('email_notification_delivery_runs_workflow_run_id_unique')
      .on(table.workflowRunId)
      .where(sql`${table.workflowRunId} IS NOT NULL`),
    index('idx_email_notification_delivery_runs_status_updated_at').on(
      table.status,
      table.updatedAt,
    ),
    check(
      'email_notification_delivery_runs_non_negative_counts',
      sql`${table.pagesCompleted} >= 0
        AND ${table.examined} >= 0
        AND ${table.claimed} >= 0
        AND ${table.sent} >= 0
        AND ${table.skipped} >= 0
        AND ${table.failed} >= 0
        AND ${table.alreadyTerminal} >= 0
        AND ${table.inFlight} >= 0
        AND ${table.manualReview} >= 0
        AND ${table.recipientErrors} >= 0`,
    ),
    pgPolicy('email_notification_delivery_runs_deny_all', {
      as: 'restrictive',
      for: 'all',
      to: 'public',
      using: sql`false`,
      withCheck: sql`false`,
    }),
  ],
).enableRLS();
