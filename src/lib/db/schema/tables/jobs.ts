import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { jobStatus, jobType } from '../../enums';
import { learningPlans } from './plans';
import { users } from './users';
import { authenticatedRole, clerkSub, serviceRole } from './common';

// Background job queue

export const jobQueue = pgTable(
  'job_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id').references(() => learningPlans.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobType: jobType('job_type').notNull(),
    status: jobStatus('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    payload: jsonb('payload').notNull(),
    result: jsonb('result'),
    error: text('error'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('attempts_check', sql`${table.attempts} >= 0`),
    check('max_attempts_check', sql`${table.maxAttempts} >= 0`),
    // Composite index for efficient queue polling (status, scheduledFor, priority)
    index('idx_job_queue_status_scheduled_priority').on(
      table.status,
      table.scheduledFor,
      table.priority
    ),
    index('idx_job_queue_user_id').on(table.userId),
    index('idx_job_queue_plan_id').on(table.planId),
    index('idx_job_queue_created_at').on(table.createdAt),

    // RLS Policies

    // Users can read only their own jobs
    pgPolicy('job_queue_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can read all jobs (for worker processing)
    pgPolicy('job_queue_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can create jobs only for themselves
    pgPolicy('job_queue_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can insert any job
    pgPolicy('job_queue_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Only service role can update jobs (worker operations)
    pgPolicy('job_queue_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Only service role can delete jobs (cleanup operations)
    pgPolicy('job_queue_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();
