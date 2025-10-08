import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  anonRole,
  authenticatedRole,
  authUid,
  serviceRole,
} from 'drizzle-orm/supabase';
import {
  jobStatus,
  jobType,
  learningStyle,
  progressStatus,
  resourceType,
  skillLevel,
  subscriptionStatus,
  subscriptionTier,
} from './enums';

// Clerk JWT subject helper (Clerk user ID)
const clerkSub = sql`(select auth.jwt()->>'sub')`;

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

// Usage metrics table
export const usageMetrics = pgTable(
  'usage_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: text('month').notNull(), // YYYY-MM
    plansGenerated: integer('plans_generated').notNull().default(0),
    regenerationsUsed: integer('regenerations_used').notNull().default(0),
    exportsUsed: integer('exports_used').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('usage_metrics_user_id_month_unique').on(table.userId, table.month),
    index('idx_usage_metrics_user_id').on(table.userId),
    index('idx_usage_metrics_month').on(table.month),
    check('plans_generated_nonneg', sql`${table.plansGenerated} >= 0`),
    check('regenerations_used_nonneg', sql`${table.regenerationsUsed} >= 0`),
    check('exports_used_nonneg', sql`${table.exportsUsed} >= 0`),

    // RLS policies
    pgPolicy('usage_metrics_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),
    pgPolicy('usage_metrics_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),
    pgPolicy('usage_metrics_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),
    pgPolicy('usage_metrics_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),
    pgPolicy('usage_metrics_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
      withCheck: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),
    pgPolicy('usage_metrics_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy('usage_metrics_delete_own', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),
    pgPolicy('usage_metrics_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Learning plans table
// TODO: add progress tracking
export const learningPlans = pgTable(
  'learning_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    skillLevel: skillLevel('skill_level').notNull(),
    weeklyHours: integer('weekly_hours').notNull(),
    learningStyle: learningStyle('learning_style').notNull(),
    startDate: date('start_date'),
    deadlineDate: date('deadline_date'),
    visibility: text('visibility').notNull().default('private'), // private | public
    origin: text('origin').notNull().default('ai'), // ai | template | manual
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('weekly_hours_check', sql`${table.weeklyHours} >= 0`),
    index('idx_learning_plans_user_id').on(table.userId),

    // RLS Policies

    // Anonymous users can read public plans
    pgPolicy('learning_plans_select_public_anon', {
      for: 'select',
      to: anonRole,
      using: sql`${table.visibility} = 'public'`,
    }),

    // Authenticated users can read public plans
    pgPolicy('learning_plans_select_public_auth', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.visibility} = 'public'`,
    }),

    // Users can read their own plans (public or private)
    pgPolicy('learning_plans_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can read all plans
    pgPolicy('learning_plans_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can only create plans for themselves
    pgPolicy('learning_plans_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can insert any plan
    pgPolicy('learning_plans_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Users can update only their own plans (prevent changing userId)
    pgPolicy('learning_plans_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
      withCheck: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can update any plan
    pgPolicy('learning_plans_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Users can delete only their own plans
    pgPolicy('learning_plans_delete_own', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can delete any plan
    pgPolicy('learning_plans_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Modules table
// TODO: add a completed field of some sort for module level progress tracking
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    estimatedMinutes: integer('estimated_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('order_check', sql`${table.order} >= 1`),
    check('estimated_minutes_check', sql`${table.estimatedMinutes} >= 0`),
    unique('modules_plan_id_order_unique').on(table.planId, table.order),
    index('idx_modules_plan_id').on(table.planId),
    index('idx_modules_plan_id_order').on(table.planId, table.order),

    // RLS Policies

    // Anonymous users can read modules of public plans
    pgPolicy('modules_select_public_anon', {
      for: 'select',
      to: anonRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.visibility} = 'public'
        )
      `,
    }),

    // Authenticated users can read modules of public plans
    pgPolicy('modules_select_public_auth', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.visibility} = 'public'
        )
      `,
    }),

    // Users can read modules of their own plans
    pgPolicy('modules_select_own_plan', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}

          )
        )
      `,
    }),

    // Service role can read all modules
    pgPolicy('modules_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can insert modules only in their own plans
    pgPolicy('modules_insert_own_plan', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can insert any module
    pgPolicy('modules_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Users can update modules only in their own plans
    pgPolicy('modules_update_own_plan', {
      for: 'update',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can update any module
    pgPolicy('modules_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Users can delete modules only in their own plans
    pgPolicy('modules_delete_own_plan', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can delete any module
    pgPolicy('modules_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Tasks table
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    estimatedMinutes: integer('estimated_minutes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('order_check', sql`${table.order} >= 1`),
    check('estimated_minutes_check', sql`${table.estimatedMinutes} >= 0`),
    unique('tasks_module_id_order_unique').on(table.moduleId, table.order),
    index('idx_tasks_module_id').on(table.moduleId),
    index('idx_tasks_module_id_order').on(table.moduleId, table.order),

    // RLS Policies

    // Anonymous users can read tasks of public plans
    pgPolicy('tasks_select_public_anon', {
      for: 'select',
      to: anonRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.visibility} = 'public'
        )
      `,
    }),

    // Authenticated users can read tasks of public plans
    pgPolicy('tasks_select_public_auth', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.visibility} = 'public'
        )
      `,
    }),

    // Users can read tasks of their own plans
    pgPolicy('tasks_select_own_plan', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}

          )
        )
      `,
    }),

    // Service role can read all tasks
    pgPolicy('tasks_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can insert tasks only in their own plans
    pgPolicy('tasks_insert_own_plan', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can insert any task
    pgPolicy('tasks_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Users can update tasks only in their own plans
    pgPolicy('tasks_update_own_plan', {
      for: 'update',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can update any task
    pgPolicy('tasks_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Users can delete tasks only in their own plans
    pgPolicy('tasks_delete_own_plan', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${modules}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${modules.id} = ${table.moduleId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can delete any task
    pgPolicy('tasks_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Resources table (global catalog)
export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: resourceType('type').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull().unique(),
    domain: text('domain'),
    author: text('author'),
    durationMinutes: integer('duration_minutes'),
    costCents: integer('cost_cents'),
    currency: text('currency'), // ISO code (3 chars)
    tags: text('tags').array(), // PostgreSQL array
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('duration_minutes_check', sql`${table.durationMinutes} >= 0`),
    check('cost_cents_check', sql`${table.costCents} >= 0`),
    index('idx_resources_type').on(table.type),

    // RLS Policies

    // Anonymous users can read all resources (public catalog)
    pgPolicy('resources_select_anon', {
      for: 'select',
      to: anonRole,
      using: sql`true`,
    }),

    // Authenticated users can read all resources
    pgPolicy('resources_select_auth', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),

    // Only service role can manage resources (admin/system only)
    pgPolicy('resources_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    pgPolicy('resources_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    pgPolicy('resources_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Task resources junction table
export const taskResources = pgTable(
  'task_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('order_check', sql`${table.order} >= 1`),
    unique('task_resources_task_id_resource_id_unique').on(
      table.taskId,
      table.resourceId
    ),
    index('idx_task_resources_task_id').on(table.taskId),
    index('idx_task_resources_resource_id').on(table.resourceId),

    // RLS Policies

    // Anonymous users can read task resources of public plans
    pgPolicy('task_resources_select_public_anon', {
      for: 'select',
      to: anonRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.visibility} = 'public'
        )
      `,
    }),

    // Authenticated users can read task resources of public plans
    pgPolicy('task_resources_select_public_auth', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.visibility} = 'public'
        )
      `,
    }),

    // Users can read task resources of their own plans
    pgPolicy('task_resources_select_own_plan', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}

          )
        )
      `,
    }),

    // Service role can read all task resources
    pgPolicy('task_resources_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can manage task resources only in their own plans
    pgPolicy('task_resources_insert_own_plan', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    pgPolicy('task_resources_update_own_plan', {
      for: 'update',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    pgPolicy('task_resources_delete_own_plan', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can manage all task resources
    pgPolicy('task_resources_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    pgPolicy('task_resources_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    pgPolicy('task_resources_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Task progress table (per-user progress)
export const taskProgress = pgTable(
  'task_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: progressStatus('status').notNull().default('not_started'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('task_progress_task_id_user_id_unique').on(
      table.taskId,
      table.userId
    ),
    index('idx_task_progress_user_id').on(table.userId),
    index('idx_task_progress_task_id').on(table.taskId),

    // RLS Policies

    // Users can only read their own progress
    pgPolicy('task_progress_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can read all progress
    pgPolicy('task_progress_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can create progress only for themselves and only for tasks they can access
    pgPolicy('task_progress_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        ${table.userId} IN (
          SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
        ) AND
        EXISTS (
          SELECT 1 FROM ${tasks}
          JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
          JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
          WHERE ${tasks.id} = ${table.taskId}
          AND (
            ${learningPlans.userId} IN (
              SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
            ) OR
            ${learningPlans.visibility} = 'public'
          )
        )
      `,
    }),

    // Service role can insert any progress
    pgPolicy('task_progress_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Users can update only their own progress (prevent changing taskId or userId)
    pgPolicy('task_progress_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}

      )`,
      withCheck: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can update any progress
    pgPolicy('task_progress_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Users can delete only their own progress
    pgPolicy('task_progress_delete_own', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )`,
    }),

    // Service role can delete any progress
    pgPolicy('task_progress_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Plan generations table (regeneration traceability)
export const planGenerations = pgTable(
  'plan_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    model: text('model').notNull(), // e.g., gpt-5
    prompt: jsonb('prompt').notNull(), // inputs
    parameters: jsonb('parameters'), // e.g., temperature
    outputSummary: jsonb('output_summary'), // high-level summary or counts
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_plan_generations_plan_id').on(table.planId),

    // RLS Policies

    // Users can read generation records only for their own plans
    pgPolicy('plan_generations_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}

          )
        )
      `,
    }),

    // Service role can read all generation records
    pgPolicy('plan_generations_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Users can create generation records only for their own plans
    pgPolicy('plan_generations_insert_own', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can insert any generation record
    pgPolicy('plan_generations_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),

    // Users can update generation records only for their own plans (rare operation)
    pgPolicy('plan_generations_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${authUid}
          )
        )
      `,
    }),

    // Service role can update any generation record
    pgPolicy('plan_generations_update_service', {
      for: 'update',
      to: serviceRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),

    // Users can delete generation records only for their own plans (rare operation)
    pgPolicy('plan_generations_delete_own', {
      for: 'delete',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can delete any generation record
    pgPolicy('plan_generations_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

// Generation attempts table (AI generation attempt telemetry)
export const generationAttempts = pgTable(
  'generation_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // 'success' | 'failure' (validated in app layer)
    classification: text('classification'), // nullable on success; failure-only classification
    durationMs: integer('duration_ms').notNull(),
    modulesCount: integer('modules_count').notNull(),
    tasksCount: integer('tasks_count').notNull(),
    truncatedTopic: boolean('truncated_topic').notNull().default(false),
    truncatedNotes: boolean('truncated_notes').notNull().default(false),
    normalizedEffort: boolean('normalized_effort').notNull().default(false),
    promptHash: text('prompt_hash'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_generation_attempts_plan_id').on(table.planId),
    index('idx_generation_attempts_created_at').on(table.createdAt),
    // classification NULL only when status = success (app-enforced; CHECK constraint added in migration)

    // RLS Policies

    // Authenticated users can read attempts for plans they own
    pgPolicy('generation_attempts_select_own_plan', {
      for: 'select',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can read all attempts for observability tooling
    pgPolicy('generation_attempts_select_service', {
      for: 'select',
      to: serviceRole,
      using: sql`true`,
    }),

    // Authenticated users can insert attempts only for plans they own
    pgPolicy('generation_attempts_insert_own_plan', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM ${learningPlans}
          WHERE ${learningPlans.id} = ${table.planId}
          AND ${learningPlans.userId} IN (
            SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
          )
        )
      `,
    }),

    // Service role can insert attempts (background jobs)
    pgPolicy('generation_attempts_insert_service', {
      for: 'insert',
      to: serviceRole,
      withCheck: sql`true`,
    }),
  ]
).enableRLS();

// Job queue table (background job processing)
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
