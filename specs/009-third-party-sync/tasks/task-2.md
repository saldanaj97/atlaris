## Task 2: Database Schema - Notion Sync State Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/XXXX_add_notion_sync_state.sql`

**Step 1: Add notion_sync_state table to schema**

Edit `src/lib/db/schema.ts`, add after integrationTokens:

```typescript
export const notionSyncState = pgTable(
  'notion_sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notionPageId: text('notion_page_id').notNull(),
    notionDatabaseId: text('notion_database_id'),
    syncHash: text('sync_hash').notNull(), // SHA-256 hash of plan content
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    planIdUnique: unique('notion_sync_plan_id_unique').on(table.planId),
    planIdIdx: index('notion_sync_state_plan_id_idx').on(table.planId),
    userIdIdx: index('notion_sync_state_user_id_idx').on(table.userId),
  })
);
```

**Step 2: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: New migration file created

**Step 3: Apply migrations**

Run:

```bash
pnpm db:push && pnpm db:push:test
```

Expected: "notion_sync_state" table created in both databases

**Step 4: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 5: Commit schema changes**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add notion_sync_state table for delta sync

Add table to track Notion page associations and sync state per learning
plan. Supports delta sync via content hash comparison and last sync
timestamp.

Changes:
- Add notion_sync_state table with page/database ID tracking
- Add sync_hash field for content change detection
- Add unique constraint on plan_id (one Notion page per plan)

New files:
- src/lib/db/migrations/XXXX_add_notion_sync_state.sql"
```

**Step 6: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
