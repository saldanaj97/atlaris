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
import { authenticatedRole, clerkSub, serviceRole } from './common';

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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // RLS Policies

    // Users can read only their own data
    pgPolicy('users_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.clerkUserId} = ${clerkSub}`,
    }),

    // Service role can read all users (admin operations)
    pgPolicy('users_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can only insert their own record during signup
    pgPolicy('users_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.clerkUserId} = ${clerkSub}`,
    }),

    // Service role can insert users (system operations)
    pgPolicy('users_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Users can update only their own profile fields (not identifiers)
    // Note: Column-level privileges limit authenticated role to UPDATE only (name).
    // Stripe/subscription columns are restricted to service_role via GRANTs in migrations.
    pgPolicy('users_update_own_profile', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.clerkUserId} = ${clerkSub}`,
      withCheck: sql`${table.clerkUserId} = ${clerkSub}`,
    }),

    // Service role can update any user (admin operations)
    pgPolicy('users_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Only service role can delete users
    pgPolicy('users_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();
