import { sql } from 'drizzle-orm';
import {
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { subscriptionStatus, subscriptionTier } from '../../enums';
import { timestampFields } from '../helpers';
import { clerkSub } from './common';

// Users table

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id').notNull().unique(),
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
    monthlyExportCount: integer('monthly_export_count').notNull().default(0),
    // TODO: [OPENROUTER-MIGRATION] Add preferredAiModel column in future migration:
    // preferredAiModel: text('preferred_ai_model'), // e.g., 'google/gemini-2.0-flash-exp:free'
    // This will store the user's selected AI model from AVAILABLE_MODELS
    ...timestampFields,
  },
  (table) => [
    // RLS Policies (session-variable-based for Neon)
    //
    // These policies enforce tenant isolation by checking the JWT claims
    // session variable set by createRlsClient() from @/lib/db/rls.
    //
    // Note: Service-role operations (workers, background jobs) use the
    // bypass client from @/lib/db/drizzle which has RLS disabled.

    // Users can read only their own data
    pgPolicy('users_select_own', {
      for: 'select',
      using: sql`${table.clerkUserId} = ${clerkSub}`,
    }),

    // Users can only insert their own record during signup
    pgPolicy('users_insert_own', {
      for: 'insert',
      withCheck: sql`${table.clerkUserId} = ${clerkSub}`,
    }),

    // Users can update only their own profile fields
    // Note: Application-level validation should restrict which fields
    // users can modify (e.g., name is OK, stripe fields are not)
    pgPolicy('users_update_own', {
      for: 'update',
      using: sql`${table.clerkUserId} = ${clerkSub}`,
      withCheck: sql`${table.clerkUserId} = ${clerkSub}`,
    }),

    // Users cannot delete their own records
    // (Deletion is handled by service-role client from workers)
  ]
).enableRLS();
