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
  uuid,
} from 'drizzle-orm/pg-core';

import { generationStatus, learningStyle, skillLevel } from '../../enums';
import { timestampFields } from '../helpers';
import {
  planOwnedByCurrentUser,
  recordOwnedByCurrentUser,
} from '../policy-helpers';
import { users } from './users';
import { anonRole, authenticatedRole, serviceRole } from './common';

// Learning plans and related tables

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
    generationStatus: generationStatus('generation_status')
      .notNull()
      .default('generating'),
    isQuotaEligible: boolean('is_quota_eligible').notNull().default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    ...timestampFields,
  },
  (table) => [
    check('weekly_hours_check', sql`${table.weeklyHours} >= 0`),
    index('idx_learning_plans_user_id').on(table.userId),
    index('idx_learning_plans_user_quota').on(
      table.userId,
      table.isQuotaEligible
    ),
    index('idx_learning_plans_user_generation_status').on(
      table.userId,
      table.generationStatus
    ),

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
      using: recordOwnedByCurrentUser(table.userId),
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
      withCheck: recordOwnedByCurrentUser(table.userId),
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
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
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
      using: recordOwnedByCurrentUser(table.userId),
    }),

    // Service role can delete any plan
    pgPolicy('learning_plans_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();

export const planSchedules = pgTable(
  'plan_schedules',
  {
    planId: uuid('plan_id')
      .primaryKey()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    scheduleJson: jsonb('schedule_json').notNull(),
    inputsHash: text('inputs_hash').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    timezone: text('timezone').notNull(),
    weeklyHours: integer('weekly_hours').notNull(),
    startDate: date('start_date').notNull(),
    deadline: date('deadline'),
  },
  (table) => {
    const planOwnership = planOwnedByCurrentUser({
      planIdColumn: table.planId,
      planTable: learningPlans,
      planIdReferenceColumn: learningPlans.id,
      planUserIdColumn: learningPlans.userId,
    });

    return [
      index('idx_plan_schedules_inputs_hash').on(table.inputsHash),

      // RLS Policies

      // Users can read schedule cache for their own plans
      pgPolicy('plan_schedules_select_own', {
        for: 'select',
        to: authenticatedRole,
        using: planOwnership,
      }),

      // Service role can read all schedules
      pgPolicy('plan_schedules_select_service', {
        for: 'select',
        to: serviceRole,
        using: sql`true`,
      }),

      // Users can upsert schedule cache for their own plans
      pgPolicy('plan_schedules_insert_own', {
        for: 'insert',
        to: authenticatedRole,
        withCheck: planOwnership,
      }),

      pgPolicy('plan_schedules_update_own', {
        for: 'update',
        to: authenticatedRole,
        using: planOwnership,
        withCheck: planOwnership,
      }),

      // Service role can manage all schedules
      pgPolicy('plan_schedules_insert_service', {
        for: 'insert',
        to: serviceRole,
        withCheck: sql`true`,
      }),

      pgPolicy('plan_schedules_update_service', {
        for: 'update',
        to: serviceRole,
        using: sql`true`,
        withCheck: sql`true`,
      }),

      // Users can delete schedule cache for their own plans
      pgPolicy('plan_schedules_delete_own', {
        for: 'delete',
        to: authenticatedRole,
        using: planOwnership,
      }),

      pgPolicy('plan_schedules_delete_service', {
        for: 'delete',
        to: serviceRole,
        using: sql`true`,
      }),
    ];
  }
).enableRLS();

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
  (table) => {
    const planOwnership = planOwnedByCurrentUser({
      planIdColumn: table.planId,
      planTable: learningPlans,
      planIdReferenceColumn: learningPlans.id,
      planUserIdColumn: learningPlans.userId,
    });

    return [
      index('idx_plan_generations_plan_id').on(table.planId),

      // RLS Policies

      // Users can read generation records only for their own plans
      pgPolicy('plan_generations_select_own', {
        for: 'select',
        to: authenticatedRole,
        using: planOwnership,
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
        withCheck: planOwnership,
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
        using: planOwnership,
        withCheck: planOwnership,
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
        using: planOwnership,
      }),

      // Service role can delete any generation record
      pgPolicy('plan_generations_delete_service', {
        for: 'delete',
        to: serviceRole,
        using: sql`true`,
      }),
    ];
  }
).enableRLS();

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
  (table) => {
    const planOwnership = planOwnedByCurrentUser({
      planIdColumn: table.planId,
      planTable: learningPlans,
      planIdReferenceColumn: learningPlans.id,
      planUserIdColumn: learningPlans.userId,
    });

    return [
      index('idx_generation_attempts_plan_id').on(table.planId),
      index('idx_generation_attempts_created_at').on(table.createdAt),
      // classification NULL only when status = success (app-enforced; CHECK constraint added in migration)

      // RLS Policies

      // Authenticated users can read attempts for plans they own
      pgPolicy('generation_attempts_select_own_plan', {
        for: 'select',
        to: authenticatedRole,
        using: planOwnership,
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
        withCheck: planOwnership,
      }),

      // Service role can insert attempts (background jobs)
      pgPolicy('generation_attempts_insert_service', {
        for: 'insert',
        to: serviceRole,
        withCheck: sql`true`,
      }),
    ];
  }
).enableRLS();
