import { emailNotificationCategory, preferredAiModel } from '../../enums';
import { timestampFields } from '../helpers';
import { recordOwnedByCurrentUser } from '../policy-helpers';
import { users } from './users';
import {
  boolean,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: uuid('user_id')
      .primaryKey()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    preferredAiModel: preferredAiModel('preferred_ai_model'),
    analyticsTimezone: text('analytics_timezone').notNull().default('UTC'),
    ...timestampFields,
  },
  (table) => [
    pgPolicy('user_preferences_select_own', {
      for: 'select',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),
    pgPolicy('user_preferences_insert_own', {
      for: 'insert',
      to: 'authenticated',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),
    pgPolicy('user_preferences_update_own', {
      for: 'update',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),
  ],
).enableRLS();

export const userEmailNotificationSettings = pgTable(
  'user_email_notification_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    unsubscribeAllOptionalEmails: boolean('unsubscribe_all_optional_emails')
      .notNull()
      .default(false),
    ...timestampFields,
  },
  (table) => [
    pgPolicy('user_email_notification_settings_select_own', {
      for: 'select',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),
    pgPolicy('user_email_notification_settings_insert_own', {
      for: 'insert',
      to: 'authenticated',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),
    pgPolicy('user_email_notification_settings_update_own', {
      for: 'update',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),
  ],
).enableRLS();

export const userEmailNotificationPreferences = pgTable(
  'user_email_notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: emailNotificationCategory('category').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    // Absent row or enabled=false means off; this records explicit category opt-out time.
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    ...timestampFields,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.category] }),
    pgPolicy('user_email_notification_preferences_select_own', {
      for: 'select',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),
    pgPolicy('user_email_notification_preferences_insert_own', {
      for: 'insert',
      to: 'authenticated',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),
    pgPolicy('user_email_notification_preferences_update_own', {
      for: 'update',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),
  ],
).enableRLS();
