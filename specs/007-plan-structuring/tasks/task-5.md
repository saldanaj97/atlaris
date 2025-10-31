# Phase 5: Create Plan Schedules Database Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/NNNN_add_plan_schedules_table.sql` (generated)

## Step 1: Write test for plan schedules schema

Create `tests/unit/scheduling/schema.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { planSchedules } from '@/lib/db/schema';

describe('Plan Schedules Schema', () => {
  it('should have plan_schedules table defined', () => {
    expect(planSchedules).toBeDefined();
  });

  it('should have correct column structure', () => {
    const columns = Object.keys(planSchedules);
    expect(columns).toContain('planId');
    expect(columns).toContain('scheduleJson');
    expect(columns).toContain('inputsHash');
    expect(columns).toContain('generatedAt');
    expect(columns).toContain('timezone');
    expect(columns).toContain('weeklyHours');
    expect(columns).toContain('startDate');
    expect(columns).toContain('deadline');
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/unit/scheduling/schema.spec.ts`
Expected: FAIL with "Cannot find name 'planSchedules'"

## Step 3: Add plan_schedules table to schema

Modify `src/lib/db/schema.ts` - add after `learningPlans` table definition:

```typescript
// Plan schedules table (JSON cache for computed schedules)
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
  (table) => [
    index('idx_plan_schedules_inputs_hash').on(table.inputsHash),

    // RLS Policies

    // Users can read schedule cache for their own plans
    pgPolicy('plan_schedules_select_own', {
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

    pgPolicy('plan_schedules_update_own', {
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

    pgPolicy('plan_schedules_delete_service', {
      for: 'delete',
      to: serviceRole,
      using: sql`true`,
    }),
  ]
).enableRLS();
```

## Step 4: Generate migration

Run: `pnpm db:generate`
Expected: Migration file created in `src/lib/db/migrations/`

## Step 5: Apply migration to test database

Run: `pnpm db:push`
Expected: "Database schema updated successfully"

## Step 6: Run test to verify it passes

Run: `pnpm vitest run tests/unit/scheduling/schema.spec.ts`
Expected: PASS (2 tests)

## Step 7: Commit

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/* tests/unit/scheduling/schema.spec.ts
git commit -m "feat: add plan_schedules table with RLS policies"
```
