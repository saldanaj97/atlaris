import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { progressStatus, resourceType } from '../../enums';
import { timestampFields } from '../helpers';
import {
  planOwnedByCurrentUser,
  recordOwnedByCurrentUser,
  wrapCondition,
} from '../policy-helpers';
import { learningPlans } from './plans';
import { users } from './users';

// Modules, tasks, and supporting tables

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
    ...timestampFields,
  },
  (table) => {
    const ownPlanAccess = planOwnedByCurrentUser({
      planIdColumn: table.planId,
      planTable: learningPlans,
      planIdReferenceColumn: learningPlans.id,
      planUserIdColumn: learningPlans.userId,
    });

    return [
      check('order_check', sql`${table.order} >= 1`),
      check('estimated_minutes_check', sql`${table.estimatedMinutes} >= 0`),
      unique('modules_plan_id_order_unique').on(table.planId, table.order),
      index('idx_modules_plan_id').on(table.planId),
      index('idx_modules_plan_id_order').on(table.planId, table.order),

      // RLS Policies

      // Users can read modules of their own plans
      pgPolicy('modules_select_own_plan', {
        for: 'select',
        to: 'authenticated',
        using: ownPlanAccess,
      }),

      // Users can insert modules only in their own plans
      pgPolicy('modules_insert_own_plan', {
        for: 'insert',
        to: 'authenticated',
        withCheck: ownPlanAccess,
      }),

      // Users can update modules only in their own plans
      pgPolicy('modules_update_own_plan', {
        for: 'update',
        to: 'authenticated',
        using: ownPlanAccess,
        withCheck: ownPlanAccess,
      }),

      // Users can delete modules only in their own plans
      pgPolicy('modules_delete_own_plan', {
        for: 'delete',
        to: 'authenticated',
        using: ownPlanAccess,
      }),
    ];
  }
).enableRLS();

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
    hasMicroExplanation: boolean('has_micro_explanation')
      .notNull()
      .default(false),
    ...timestampFields,
  },
  (table) => {
    const moduleOwnPlanAccess = sql`
      EXISTS (
        SELECT 1 FROM ${modules}
        WHERE ${modules.id} = ${table.moduleId}
        AND ${wrapCondition(
          planOwnedByCurrentUser({
            planIdColumn: modules.planId,
            planTable: learningPlans,
            planIdReferenceColumn: learningPlans.id,
            planUserIdColumn: learningPlans.userId,
          })
        )}
      )
    `;

    return [
      check('order_check', sql`${table.order} >= 1`),
      check('estimated_minutes_check', sql`${table.estimatedMinutes} >= 0`),
      unique('tasks_module_id_order_unique').on(table.moduleId, table.order),
      index('idx_tasks_module_id').on(table.moduleId),
      index('idx_tasks_module_id_order').on(table.moduleId, table.order),

      // RLS Policies

      // Users can read tasks of their own plans
      pgPolicy('tasks_select_own_plan', {
        for: 'select',
        to: 'authenticated',
        using: moduleOwnPlanAccess,
      }),

      // Users can insert tasks only in their own plans
      pgPolicy('tasks_insert_own_plan', {
        for: 'insert',
        to: 'authenticated',
        withCheck: moduleOwnPlanAccess,
      }),

      // Users can update tasks only in their own plans
      pgPolicy('tasks_update_own_plan', {
        for: 'update',
        to: 'authenticated',
        using: moduleOwnPlanAccess,
        withCheck: moduleOwnPlanAccess,
      }),

      // Users can delete tasks only in their own plans
      pgPolicy('tasks_delete_own_plan', {
        for: 'delete',
        to: 'authenticated',
        using: moduleOwnPlanAccess,
      }),
    ];
  }
).enableRLS();

const taskBelongsToUserPlan = (taskIdColumn: AnyPgColumn) =>
  sql`
    EXISTS (
      SELECT 1 FROM ${tasks}
      JOIN ${modules} ON ${modules.id} = ${tasks.moduleId}
      JOIN ${learningPlans} ON ${learningPlans.id} = ${modules.planId}
      WHERE ${tasks.id} = ${taskIdColumn}
      AND ${wrapCondition(recordOwnedByCurrentUser(learningPlans.userId))}
    )
  `;

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: resourceType('type').notNull(),
    // TODO: [RESOURCE-HARDENING] In a future migration, add DB-level title length
    // constraint (e.g., char_length(title) <= 500) and add updatedAt for staleness tracking.
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

    // Authenticated users can read all resources
    pgPolicy('resources_select_auth', {
      for: 'select',
      to: 'authenticated',
      using: sql`true`,
    }),

    // Only service role can manage resources (admin/system only)
  ]
).enableRLS();

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
  (table) => {
    const taskOwnAccess = taskBelongsToUserPlan(table.taskId);

    return [
      check('order_check', sql`${table.order} >= 1`),
      unique('task_resources_task_id_resource_id_unique').on(
        table.taskId,
        table.resourceId
      ),
      index('idx_task_resources_task_id').on(table.taskId),
      index('idx_task_resources_resource_id').on(table.resourceId),

      // RLS Policies

      // Users can read task resources of their own plans
      pgPolicy('task_resources_select_own_plan', {
        for: 'select',
        to: 'authenticated',
        using: taskOwnAccess,
      }),

      // Users can manage task resources only in their own plans
      pgPolicy('task_resources_insert_own_plan', {
        for: 'insert',
        to: 'authenticated',
        withCheck: taskOwnAccess,
      }),

      pgPolicy('task_resources_update_own_plan', {
        for: 'update',
        to: 'authenticated',
        using: taskOwnAccess,
        withCheck: taskOwnAccess,
      }),

      pgPolicy('task_resources_delete_own_plan', {
        for: 'delete',
        to: 'authenticated',
        using: taskOwnAccess,
      }),
    ];
  }
).enableRLS();

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
  (table) => {
    const userOwnsRecord = recordOwnedByCurrentUser(table.userId);
    const taskOwnedByUser = taskBelongsToUserPlan(table.taskId);

    return [
      unique('task_progress_task_id_user_id_unique').on(
        table.taskId,
        table.userId
      ),
      index('idx_task_progress_user_id').on(table.userId),
      index('idx_task_progress_task_id').on(table.taskId),
      index('idx_task_progress_user_task').on(table.userId, table.taskId),

      // RLS Policies

      // Users can only read their own progress
      pgPolicy('task_progress_select_own', {
        for: 'select',
        to: 'authenticated',
        using: userOwnsRecord,
      }),

      // Users can create progress only for themselves and only for tasks they can access
      pgPolicy('task_progress_insert_own', {
        for: 'insert',
        to: 'authenticated',
        withCheck: sql`
          ${wrapCondition(userOwnsRecord)}
          AND ${wrapCondition(taskOwnedByUser)}
        `,
      }),

      // Users can update only their own progress (prevent changing taskId or userId)
      pgPolicy('task_progress_update_own', {
        for: 'update',
        to: 'authenticated',
        using: userOwnsRecord,
        withCheck: sql`
        ${wrapCondition(userOwnsRecord)}
        AND ${wrapCondition(taskOwnedByUser)}
      `,
      }),

      // Users can delete only their own progress
      pgPolicy('task_progress_delete_own', {
        for: 'delete',
        to: 'authenticated',
        using: userOwnsRecord,
      }),
    ];
  }
).enableRLS();
