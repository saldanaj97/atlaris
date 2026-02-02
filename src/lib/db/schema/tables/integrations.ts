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

/**
 * OAuth state tokens for CSRF protection during OAuth flows.
 *
 * This table stores short-lived tokens that map OAuth state parameters to Clerk user IDs.
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
    // Clerk user ID who initiated the OAuth flow
    clerkUserId: text('clerk_user_id').notNull(),
    // Optional: which OAuth provider this token is for (for debugging/analytics)
    provider: text('provider'),
    // When this token expires (10 minutes from creation)
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Index for fast lookups by hash
    index('oauth_state_tokens_hash_idx').on(table.stateTokenHash),
    // Index for cleanup queries (expired tokens)
    index('oauth_state_tokens_expires_at_idx').on(table.expiresAt),

    // RLS Policies
    // These tokens are accessed via service-role in OAuth callbacks,
    // but we still enforce JWT-based RLS for defense-in-depth.
    // Policies verify that clerk_user_id matches the authenticated user's sub claim.

    // Allow insert only for the token owner
    pgPolicy('oauth_state_tokens_insert', {
      for: 'insert',
      withCheck: sql`clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')`,
    }),

    // Allow select only for the token owner
    pgPolicy('oauth_state_tokens_select', {
      for: 'select',
      using: sql`clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')`,
    }),

    // Allow delete only for the token owner
    pgPolicy('oauth_state_tokens_delete', {
      for: 'delete',
      using: sql`clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')`,
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
