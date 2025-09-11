import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Enums
export const skillLevel = pgEnum('skill_level', [
  'beginner',
  'intermediate',
  'advanced',
]);
export const learningStyle = pgEnum('learning_style', [
  'reading',
  'video',
  'practice',
  'mixed',
]);
export const resourceType = pgEnum('resource_type', [
  'youtube',
  'article',
  'course',
  'doc',
  'other',
]);
export const progressStatus = pgEnum('progress_status', [
  'not_started',
  'in_progress',
  'completed',
]);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  subscriptionTier: text('subscription_tier'), // e.g., free, pro
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Learning plans table
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
  ]
);

// Modules table
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
  ]
);

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
  ]
);

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
  ]
);

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
  ]
);

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
  ]
);

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
  (table) => [index('idx_plan_generations_plan_id').on(table.planId)]
);
