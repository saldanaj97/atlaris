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
} from '../policy-helpers';
import { learningPlans } from './plans';
import { tasks } from './tasks';
import { users } from './users';

// Integration-related tables

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
      using: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can insert tokens only for themselves
    pgPolicy('integration_tokens_insert_own', {
      for: 'insert',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can update only their own tokens
    pgPolicy('integration_tokens_update_own', {
      for: 'update',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can delete only their own tokens
    pgPolicy('integration_tokens_delete_own', {
      for: 'delete',
      using: recordOwnedByCurrentUser(table.userId),
    }),
  ]
).enableRLS();

export const notionSyncState = pgTable(
  'notion_sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notionPageId: text('notion_page_id').notNull(),
    notionDatabaseId: text('notion_database_id'),
    syncHash: text('sync_hash').notNull(), // SHA-256 hash of plan content
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    ...timestampFields,
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
      unique('notion_sync_plan_id_unique').on(table.planId),
      index('notion_sync_state_plan_id_idx').on(table.planId),
      index('notion_sync_state_user_id_idx').on(table.userId),

      // RLS Policies

      // Users can read only their own sync state
      pgPolicy('notion_sync_state_select_own', {
        for: 'select',
        using: userOwnsRecord,
      }),

      // Users can insert sync state only for themselves and their own plans
      pgPolicy('notion_sync_state_insert_own', {
        for: 'insert',
        withCheck: userAndPlanOwnership,
      }),

      // Users can update only their own sync state and their own plans
      pgPolicy('notion_sync_state_update_own', {
        for: 'update',
        using: userAndPlanOwnership,
        withCheck: userAndPlanOwnership,
      }),

      // Users can delete only their own sync state and their own plans
      pgPolicy('notion_sync_state_delete_own', {
        for: 'delete',
        using: userAndPlanOwnership,
      }),
    ];
  }
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
        using: userOwnsRecord,
      }),

      // Users can insert sync state only for themselves and their own plans
      pgPolicy('google_calendar_sync_state_insert_own', {
        for: 'insert',
        withCheck: userAndPlanOwnership,
      }),

      // Users can update only their own sync state and their own plans
      pgPolicy('google_calendar_sync_state_update_own', {
        for: 'update',
        using: userAndPlanOwnership,
        withCheck: userAndPlanOwnership,
      }),

      // Users can delete only their own sync state and their own plans
      pgPolicy('google_calendar_sync_state_delete_own', {
        for: 'delete',
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
  (table) => [
    unique('task_calendar_event_unique').on(table.taskId, table.userId),
    index('task_calendar_events_task_id_idx').on(table.taskId),
    index('task_calendar_events_user_id_idx').on(table.userId),

    // RLS Policies
    pgPolicy('task_calendar_events_select_own', {
      for: 'select',
      using: recordOwnedByCurrentUser(table.userId),
    }),

    pgPolicy('task_calendar_events_insert_own', {
      for: 'insert',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    pgPolicy('task_calendar_events_update_own', {
      for: 'update',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    pgPolicy('task_calendar_events_delete_own', {
      for: 'delete',
      using: recordOwnedByCurrentUser(table.userId),
    }),
  ]
).enableRLS();
