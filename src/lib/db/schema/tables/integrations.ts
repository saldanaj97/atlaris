import { sql } from 'drizzle-orm';
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { integrationProviderEnum } from '../../enums';
import { timestampFields } from '../helpers';
import {
  recordOwnedByCurrentUser,
  userAndPlanOwnedByCurrentUser,
  userAndTaskOwnedByCurrentUser,
} from '../policy-helpers';
import { currentUserId } from './common';
import { learningPlans } from './plans';
import { modules, tasks } from './tasks';
import { users } from './users';

// Integration-related tables

/**
 * OAuth state tokens for CSRF protection during OAuth flows.
 *
 * This table stores short-lived tokens that map OAuth state parameters to auth user IDs.
 * The tokens are:
 * - Hashed (SHA-256) before storage for security
 * - Single-use (deleted on validation via atomic DELETE...RETURNING)
 * - Short-lived (10 minute TTL, enforced at query time)
 *
 * This replaces the previous in-memory LRU cache which failed in multi-instance
 * serverless deployments (e.g., Vercel) where OAuth initiation and callback
 * could land on different instances.
 */
export const oauthStateTokens = pgTable(
  'oauth_state_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hash of the state token (never store plaintext)
    stateTokenHash: text('state_token_hash').notNull(),
    // Auth user ID who initiated the OAuth flow
    authUserId: text('auth_user_id').notNull(),
    // Optional: which OAuth provider this token is for (for debugging/analytics)
    provider: text('provider'),
    // When this token expires (10 minutes from creation)
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('oauth_state_tokens_hash_idx').on(table.stateTokenHash),
    index('oauth_state_tokens_expires_at_idx').on(table.expiresAt),
    pgPolicy('oauth_state_tokens_insert', {
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`${table.authUserId} = ${currentUserId}`,
    }),
    pgPolicy('oauth_state_tokens_select', {
      for: 'select',
      to: 'authenticated',
      using: sql`${table.authUserId} = ${currentUserId}`,
    }),
    pgPolicy('oauth_state_tokens_delete', {
      for: 'delete',
      to: 'authenticated',
      using: sql`${table.authUserId} = ${currentUserId}`,
    }),
  ]
).enableRLS();

export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: integrationProviderEnum('provider').notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    workspaceId: text('workspace_id'),
    workspaceName: text('workspace_name'),
    botId: text('bot_id'),
    ...timestampFields,
  },
  (table) => [
    unique('user_provider_unique').on(table.userId, table.provider),
    index('integration_tokens_user_id_idx').on(table.userId),
    index('integration_tokens_provider_idx').on(table.provider),

    // RLS Policies

    // Users can read only their own integration tokens
    pgPolicy('integration_tokens_select_own', {
      for: 'select',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can insert tokens only for themselves
    pgPolicy('integration_tokens_insert_own', {
      for: 'insert',
      to: 'authenticated',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can update only their own tokens
    pgPolicy('integration_tokens_update_own', {
      for: 'update',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can delete only their own tokens
    pgPolicy('integration_tokens_delete_own', {
      for: 'delete',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),
  ]
).enableRLS();

export const googleCalendarSyncState = pgTable(
  'google_calendar_sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    syncToken: text('sync_token'), // Google's incremental sync token
    calendarId: text('calendar_id').notNull().default('primary'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    const userOwnsRecord = recordOwnedByCurrentUser(table.userId);
    const userAndPlanOwnership = userAndPlanOwnedByCurrentUser({
      userIdColumn: table.userId,
      planIdColumn: table.planId,
      planTable: learningPlans,
      planIdReferenceColumn: learningPlans.id,
      planUserIdColumn: learningPlans.userId,
    });

    return [
      unique('gcal_sync_plan_id_unique').on(table.planId),
      index('google_calendar_sync_state_plan_id_idx').on(table.planId),
      index('google_calendar_sync_state_user_id_idx').on(table.userId),

      // RLS Policies

      // Users can read only their own sync state
      pgPolicy('google_calendar_sync_state_select_own', {
        for: 'select',
        to: 'authenticated',
        using: userOwnsRecord,
      }),

      // Users can insert sync state only for themselves and their own plans
      pgPolicy('google_calendar_sync_state_insert_own', {
        for: 'insert',
        to: 'authenticated',
        withCheck: userAndPlanOwnership,
      }),

      // Users can update only their own sync state and their own plans
      pgPolicy('google_calendar_sync_state_update_own', {
        for: 'update',
        to: 'authenticated',
        using: userAndPlanOwnership,
        withCheck: userAndPlanOwnership,
      }),

      // Users can delete only their own sync state and their own plans
      pgPolicy('google_calendar_sync_state_delete_own', {
        for: 'delete',
        to: 'authenticated',
        using: userAndPlanOwnership,
      }),
    ];
  }
).enableRLS();

export const taskCalendarEvents = pgTable(
  'task_calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarEventId: text('calendar_event_id').notNull(),
    calendarId: text('calendar_id').notNull().default('primary'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    const userAndTaskOwnership = userAndTaskOwnedByCurrentUser({
      userIdColumn: table.userId,
      taskIdColumn: table.taskId,
      taskTable: tasks,
      taskIdReferenceColumn: tasks.id,
      taskModuleIdColumn: tasks.moduleId,
      moduleTable: modules,
      moduleIdReferenceColumn: modules.id,
      modulePlanIdColumn: modules.planId,
      planTable: learningPlans,
      planIdReferenceColumn: learningPlans.id,
      planUserIdColumn: learningPlans.userId,
    });

    return [
      unique('task_calendar_event_unique').on(table.taskId, table.userId),
      index('task_calendar_events_task_id_idx').on(table.taskId),
      index('task_calendar_events_user_id_idx').on(table.userId),

      // RLS Policies
      pgPolicy('task_calendar_events_select_own', {
        for: 'select',
        to: 'authenticated',
        using: userAndTaskOwnership,
      }),

      pgPolicy('task_calendar_events_insert_own', {
        for: 'insert',
        to: 'authenticated',
        withCheck: userAndTaskOwnership,
      }),

      pgPolicy('task_calendar_events_update_own', {
        for: 'update',
        to: 'authenticated',
        using: userAndTaskOwnership,
        withCheck: userAndTaskOwnership,
      }),

      pgPolicy('task_calendar_events_delete_own', {
        for: 'delete',
        to: 'authenticated',
        using: userAndTaskOwnership,
      }),
    ];
  }
).enableRLS();
