## Task 3: Database Schema - Google Calendar Sync State Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/XXXX_add_google_calendar_sync_state.sql`

**Step 1: Add google_calendar_sync_state table**

Edit `src/lib/db/schema.ts`, add after notionSyncState:

```typescript
export const googleCalendarSyncState = pgTable(
  'google_calendar_sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    syncToken: text('sync_token'), // Google's incremental sync token
    calendarId: text('calendar_id').notNull().default('primary'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    planIdUnique: unique('gcal_sync_plan_id_unique').on(table.planId),
    planIdIdx: index('google_calendar_sync_state_plan_id_idx').on(table.planId),
    userIdIdx: index('google_calendar_sync_state_user_id_idx').on(table.userId),
  })
);
```

**Step 2: Add task_calendar_events mapping table**

Edit `src/lib/db/schema.ts`, add after googleCalendarSyncState:

```typescript
export const taskCalendarEvents = pgTable(
  'task_calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarEventId: text('calendar_event_id').notNull(),
    calendarId: text('calendar_id').notNull().default('primary'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    taskIdUnique: unique('task_calendar_event_unique').on(
      table.taskId,
      table.userId
    ),
    taskIdIdx: index('task_calendar_events_task_id_idx').on(table.taskId),
    userIdIdx: index('task_calendar_events_user_id_idx').on(table.userId),
  })
);
```

**Step 3: Generate and apply migrations**

Run:

```bash
pnpm db:generate && pnpm db:push && pnpm db:push:test
```

Expected: Both tables created successfully

**Step 4: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 5: Commit schema changes**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add google_calendar sync state tables

Add tables to track Google Calendar sync state and task-to-event
mappings. Supports incremental sync via Google's sync tokens.

Changes:
- Add google_calendar_sync_state with sync token tracking
- Add task_calendar_events for task-to-event ID mapping
- Add unique constraints to prevent duplicate events

New files:
- src/lib/db/migrations/XXXX_add_google_calendar_sync_state.sql"
```

**Step 6: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
