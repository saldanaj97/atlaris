## Task 1: Database Schema - Integration Tokens Table

**Files:**

- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/enums.ts`
- Create: `src/lib/db/migrations/XXXX_add_integration_tokens.sql`

**Step 1: Add integration provider enum**

Edit `src/lib/db/enums.ts`:

```typescript
export const integrationProviderEnum = pgEnum('integration_provider', [
  'notion',
  'google_calendar',
]);
```

**Step 2: Add integration_tokens table to schema**

Edit `src/lib/db/schema.ts`, add after users table:

```typescript
import { integrationProviderEnum } from './enums';

export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: integrationProviderEnum('provider').notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    workspaceId: text('workspace_id'),
    workspaceName: text('workspace_name'),
    botId: text('bot_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userProviderUnique: unique('user_provider_unique').on(
      table.userId,
      table.provider
    ),
    userIdIdx: index('integration_tokens_user_id_idx').on(table.userId),
    providerIdx: index('integration_tokens_provider_idx').on(table.provider),
  })
);
```

**Step 3: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: New migration file created in `src/lib/db/migrations/`

**Step 4: Apply migration to local database**

Run:

```bash
pnpm db:push
```

Expected: "integration_tokens" table created successfully

**Step 5: Apply migration to test database**

Run:

```bash
pnpm db:push:test
```

Expected: "integration_tokens" table created in test database

**Step 6: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 7: Commit schema changes**

```bash
git add src/lib/db/enums.ts src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add integration_tokens table for OAuth storage

Add table to store encrypted OAuth tokens for Notion and Google Calendar
integrations. Supports access/refresh tokens, workspace metadata, and
per-user-provider uniqueness constraint.

Changes:
- Add integration_provider enum (notion, google_calendar)
- Add integration_tokens table with encryption-ready fields
- Generate and apply migrations for both local and test databases

New files:
- src/lib/db/migrations/XXXX_add_integration_tokens.sql"
```

---
