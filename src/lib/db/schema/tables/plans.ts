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

import type { PdfContext } from '@/lib/pdf/context';

import {
  generationStatus,
  learningStyle,
  planOrigin,
  skillLevel,
} from '../../enums';
import { timestampFields } from '../helpers';
import {
  planOwnedByCurrentUser,
  recordOwnedByCurrentUser,
} from '../policy-helpers';
import { users } from './users';

// Learning plans and related tables

export type GenerationAttemptStatus = 'in_progress' | 'success' | 'failure';

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
    visibility: text('visibility').notNull().default('private'),
    origin: planOrigin('origin').notNull().default('ai'),
    // extracted_context: PdfContext | null. DB CHECK enforces shape when non-null;
    // all writes must go through typed Drizzle client using sanitizePdfContextForPersistence.
    extractedContext: jsonb('extracted_context').$type<PdfContext | null>(),
    generationStatus: generationStatus('generation_status')
      .notNull()
      .default('generating'),
    isQuotaEligible: boolean('is_quota_eligible').notNull().default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    ...timestampFields,
  },
  (table) => [
    check('weekly_hours_check', sql`${table.weeklyHours} >= 0`),
    check(
      'extracted_context_pdf_shape',
      sql`(
        ${table.extractedContext} IS NULL
        OR (
          jsonb_typeof(${table.extractedContext}) = 'object'
          AND (${table.extractedContext} ? 'mainTopic')
          AND (${table.extractedContext} ? 'sections')
          AND jsonb_typeof(${table.extractedContext}->'sections') = 'array'
          AND jsonb_typeof(${table.extractedContext}->'mainTopic') = 'string'
        )
      )`
    ),
    index('idx_learning_plans_user_id').on(table.userId),
    index('idx_learning_plans_user_quota').on(
      table.userId,
      table.isQuotaEligible
    ),
    index('idx_learning_plans_user_generation_status').on(
      table.userId,
      table.generationStatus
    ),
    index('idx_learning_plans_user_origin').on(table.userId, table.origin),
    index('idx_learning_plans_user_quota_generation_status').on(
      table.userId,
      table.isQuotaEligible,
      table.generationStatus
    ),

    // RLS Policies (session-variable-based for Neon)
    // Note: Learning plans are private-only product data.
    // Service-role operations use bypass client from @/lib/db/service-role.

    // Users can read only their own plans
    pgPolicy('learning_plans_select', {
      for: 'select',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can only create plans for themselves
    pgPolicy('learning_plans_insert', {
      for: 'insert',
      to: 'authenticated',
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can update only their own plans
    pgPolicy('learning_plans_update', {
      for: 'update',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
      withCheck: recordOwnedByCurrentUser(table.userId),
    }),

    // Users can delete only their own plans
    pgPolicy('learning_plans_delete', {
      for: 'delete',
      to: 'authenticated',
      using: recordOwnedByCurrentUser(table.userId),
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

      // RLS Policies (session-variable-based)

      // Users can read schedule cache for their own plans
      pgPolicy('plan_schedules_select', {
        for: 'select',
        to: 'authenticated',
        using: planOwnership,
      }),

      // Users can create/update schedule cache for their own plans
      pgPolicy('plan_schedules_insert', {
        for: 'insert',
        to: 'authenticated',
        withCheck: planOwnership,
      }),

      pgPolicy('plan_schedules_update', {
        for: 'update',
        to: 'authenticated',
        using: planOwnership,
        withCheck: planOwnership,
      }),

      // Users can delete schedule cache for their own plans
      pgPolicy('plan_schedules_delete', {
        for: 'delete',
        to: 'authenticated',
        using: planOwnership,
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

      // RLS Policies (session-variable-based)

      // Users can read generation records only for their own plans
      pgPolicy('plan_generations_select', {
        for: 'select',
        to: 'authenticated',
        using: planOwnership,
      }),

      // Users can create generation records only for their own plans
      pgPolicy('plan_generations_insert', {
        for: 'insert',
        to: 'authenticated',
        withCheck: planOwnership,
      }),

      // Users can update generation records only for their own plans
      pgPolicy('plan_generations_update', {
        for: 'update',
        to: 'authenticated',
        using: planOwnership,
        withCheck: planOwnership,
      }),

      // Users can delete generation records only for their own plans
      pgPolicy('plan_generations_delete', {
        for: 'delete',
        to: 'authenticated',
        using: planOwnership,
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
    status: text('status').$type<GenerationAttemptStatus>().notNull(),
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

      // RLS Policies (session-variable-based)

      // Users can read attempts for plans they own
      pgPolicy('generation_attempts_select', {
        for: 'select',
        to: 'authenticated',
        using: planOwnership,
      }),

      // Users can insert attempts only for plans they own
      pgPolicy('generation_attempts_insert', {
        for: 'insert',
        to: 'authenticated',
        withCheck: planOwnership,
      }),

      // Users can update attempts only for plans they own
      pgPolicy('generation_attempts_update', {
        for: 'update',
        to: 'authenticated',
        using: planOwnership,
        withCheck: planOwnership,
      }),

      // Immutable audit log: deletes explicitly denied for authenticated
      pgPolicy('generation_attempts_delete_deny', {
        as: 'restrictive',
        for: 'delete',
        to: 'authenticated',
        using: sql`false`,
      }),
    ];
  }
).enableRLS();
