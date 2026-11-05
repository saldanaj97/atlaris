import { recordOwnedByCurrentUser } from '../policy-helpers';
import { users } from './users';
import { index, pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Generation attempts from deleted plans that still count toward the owner's
 * hourly limit. Deleting a plan cascades away its `generation_attempts`, so
 * `deletePlan` copies the ones inside the window here. Each delete also prunes the
 * owner's expired rows, so rows per user stay small without a retention job.
 * Writes are server-owned (service role).
 */
export const deletedPlanGenerationAttempts = pgTable(
  'deleted_plan_generation_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptCreatedAt: timestamp('attempt_created_at', {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    index('idx_deleted_plan_generation_attempts_user_created_at').on(
      table.userId,
      table.attemptCreatedAt,
    ),

    // Users can read their own rows; the hourly limit runs on the RLS client
    pgPolicy('deleted_plan_generation_attempts_select_own', {
      for: 'select',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),
  ],
).enableRLS();
