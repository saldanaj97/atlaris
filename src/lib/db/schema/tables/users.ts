import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  preferredAiModel as preferredAiModelEnum,
  subscriptionStatus,
  subscriptionTier,
} from '../../enums';
import { timestampFields } from '../helpers';
import { currentUserId } from './common';

// Users table

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: text('auth_user_id').notNull().unique(),
    email: text('email').notNull().unique(),
    name: text('name'),
    subscriptionTier: subscriptionTier('subscription_tier')
      .notNull()
      .default('free'),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    subscriptionStatus: subscriptionStatus('subscription_status'),
    subscriptionPeriodEnd: timestamp('subscription_period_end', {
      withTimezone: true,
    }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    monthlyExportCount: integer('monthly_export_count').notNull().default(0),
    preferredAiModel: preferredAiModelEnum('preferred_ai_model'),
    ...timestampFields,
  },
  (table) => [
    // RLS Policies (session-variable-based for Neon)
    //
    // These policies enforce tenant isolation by checking the JWT claims
    // session variable set by createRlsClient() from @/lib/db/rls.
    //
    // Note: Service-role operations (workers, background jobs) use the
    // bypass client from @/lib/db/service-role which has RLS disabled.

    // Users can read only their own data
    pgPolicy('users_select_own', {
      for: 'select',
      to: 'authenticated',
      using: sql`${table.authUserId} = ${currentUserId}`,
    }),

    // Users can only insert their own record during signup
    pgPolicy('users_insert_own', {
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`${table.authUserId} = ${currentUserId}`,
    }),

    // Users can update only their own profile fields.
    // Column-level privileges (migration 0018; see
    // privileges/users-authenticated-update-columns.ts) restrict the authenticated
    // role. Billing and system columns are only writable by the service-role (BYPASSRLS).
    pgPolicy('users_update_own', {
      for: 'update',
      to: 'authenticated',
      using: sql`${table.authUserId} = ${currentUserId}`,
      withCheck: sql`${table.authUserId} = ${currentUserId}`,
    }),

    // Users cannot delete their own records
    // (Deletion is handled by service-role client from workers)
  ]
).enableRLS();
