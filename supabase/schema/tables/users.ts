import { subscriptionStatus, subscriptionTier } from '../../enums';
import { timestampFields } from '../helpers';
import { currentUserId } from './common';
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

// Users table

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: text('auth_user_id').notNull().unique(),
    email: text('email').unique(),
    clerkUserUpdatedAt: timestamp('clerk_user_updated_at', {
      withTimezone: true,
    }),
    clerkBillingUpdatedAt: timestamp('clerk_billing_updated_at', {
      withTimezone: true,
    }),
    clerkDeletedAt: timestamp('clerk_deleted_at', { withTimezone: true }),
    name: text('name'),
    subscriptionTier: subscriptionTier('subscription_tier')
      .notNull()
      .default('free'),
    subscriptionStatus: subscriptionStatus('subscription_status'),
    subscriptionPeriodEnd: timestamp('subscription_period_end', {
      withTimezone: true,
    }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    monthlyExportCount: integer('monthly_export_count').notNull().default(0),
    // Server-owned lifetime entitlements. Authenticated UPDATE grants omit these.
    // free_access_plan_id FK (ON DELETE SET NULL) lives in SQL so this table
    // does not import learning_plans and create a circular module cycle.
    initialPlanGeneratedAt: timestamp('initial_plan_generated_at', {
      withTimezone: true,
    }),
    freeAccessPlanId: uuid('free_access_plan_id'),
    freeAccessPlanSelectedAt: timestamp('free_access_plan_selected_at', {
      withTimezone: true,
    }),
    ...timestampFields,
  },
  (table) => [
    // RLS Policies (session-variable-based provider identity)
    //
    // These policies enforce tenant isolation by checking the JWT claims
    // session variable set by createRlsClient() from @supabase/rls.
    //
    // Note: Service-role operations (workers, background jobs) use the
    // bypass client from @supabase/service-role which has RLS disabled.

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
    // Column-level privileges (see
    // privileges/users-authenticated-update-columns.ts) restrict the authenticated
    // role. Billing, system, and lifetime entitlement columns are only writable
    // by the service-role (BYPASSRLS).
    pgPolicy('users_update_own', {
      for: 'update',
      to: 'authenticated',
      using: sql`${table.authUserId} = ${currentUserId}`,
      withCheck: sql`${table.authUserId} = ${currentUserId}`,
    }),

    // Users cannot delete their own records
    // (Deletion is handled by service-role client from workers)
  ],
).enableRLS();
