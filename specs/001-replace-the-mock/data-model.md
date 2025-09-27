# Data Model: AI‑Backed Learning Plan Generation

Date: 2025-09-27  
Phase: 1 (Design)  
Scope: New/changed persistence elements to support atomic generation attempts, logging, and adaptive timeout policies.
CREATE TABLE generation_attempts (

## Existing Tables (Context)

- learning_plans (id, user_id, topic, skill_level, weekly_hours, learning_style, visibility, origin, timestamps)
  classification text CHECK (classification IN ('validation','provider_error','rate_limit','timeout','capped')),
- tasks (id, module_id, title, order, estimated_minutes, timestamps)
- plan_generations (historical regeneration metadata) – lacks classification & fine-grained attempt diagnostics.

## New Table: generation_attempts

Purpose: Record every AI generation attempt (initial + retries) with classification & outcome metrics, persisted atomically with produced modules/tasks.

```sql
CREATE TABLE generation_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  CONSTRAINT classification_null_on_success CHECK (
    (status = 'success' AND classification IS NULL) OR (status = 'failure')
  )
  plan_id           uuid NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  status            text NOT NULL CHECK (status IN ('success','failure')),
    status: text('status').notNull(), // ('success' | 'failure')
    classification: text('classification'), // failure-only classification (nullable on success)
  duration_ms       integer NOT NULL CHECK (duration_ms >= 0),
  modules_count     integer NOT NULL CHECK (modules_count >= 0),
  tasks_count       integer NOT NULL CHECK (tasks_count >= 0),
  truncated_topic   boolean NOT NULL DEFAULT false,
  truncated_notes   boolean NOT NULL DEFAULT false,
  normalized_effort boolean NOT NULL DEFAULT false,  -- TRUE if any module/task effort clamped
  prompt_hash       text, -- sha256 or similar of canonical prompt/payload
  metadata          jsonb, -- generic bucket: input length metrics, normalization details, raw provider usage numbers
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_generation_attempts_plan_id ON generation_attempts(plan_id);

CREATE INDEX idx_generation_attempts_created_at ON generation_attempts(created_at);
```

### Rationale

- Separate from `plan_generations` to avoid retrofitting multiple nullable columns and mixing semantics (version/regeneration vs low-level attempt telemetry).
- `classification` includes `capped` for attempt cap rejection (no provider call). Keep consistent enumerated domain.

### Drizzle Schema Snippet (Illustrative)

```ts
export const generationAttempts = pgTable(
  'generation_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => learningPlans.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // validate app-side ('success' | 'failure')
    classification: text('classification').notNull(),
    model: text('model').notNull(),
    durationMs: integer('duration_ms').notNull(),
    modulesCount: integer('modules_count').notNull(),
    tasksCount: integer('tasks_count').notNull(),
    truncatedTopic: integer('truncated_topic', { mode: 'boolean' })
Plan failure: most recent attempt has `status='failure'` AND `modules_count=0` AND attempt cap reached (optional UX indicator). A dedicated `status` field may be added to `learning_plans` later for denormalized reads (see plan.md deferred section).
      .notNull()
      .default(false),
    truncatedNotes: integer('truncated_notes', { mode: 'boolean' })
      .notNull()
      .default(false),
    normalizedEffort: integer('normalized_effort', { mode: 'boolean' })
      .notNull()
      .default(false),
    promptHash: text('prompt_hash'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_generation_attempts_plan_id').on(table.planId),
    index('idx_generation_attempts_created_at').on(table.createdAt),
  ]
);
```

(Use `boolean()` if available; shown with `integer(..., { mode: 'boolean' })` pattern if repository conventions require.)

### RLS (Row Level Security) Policies (Concept)

- select (authenticated): join ownership via plan -> user (mirror existing `plan_generations_select_own`).
- insert (authenticated): allowed only if user owns plan and attempt cap (<3) not exceeded (application-enforced preflight; RLS ensures ownership).
- updates/deletes: not required in MVP (immutable records) – service role only if needed.

## Changes to Existing Tables

No schema changes required immediately. (Optionally `learning_plans` could gain a computed/status column later, but pending state derivable: plan ready if modules_count > 0.)

## Derived Status Logic

| Validation Condition    | Action                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| No modules parsed       | classify validation; no inserts (attempt still recorded with modules_count=0) |
| Duplicate order indices | validation failure; rollback; attempt recorded with classification validation |
| Minutes out of range    | clamp & set normalized_effort=true                                            |
| Timeout before parse    | classification timeout; attempt failure; no modules/tasks persisted           |
| Attempt cap exceeded    | classification capped; no provider call; attempt inserted only                |

## Transaction Flow (Success)

1. Validate input lengths (record trunc flags).
2. Provider stream → parse modules/tasks in memory.
3. Normalize & validate structure.
4. Begin transaction.
5. Insert modules & tasks (bulk/ordered).
6. Insert attempt row (`status=success`, counts).
7. Commit.

Failure paths either abort pre-transaction or rollback so that attempt row is written only inside transaction paired with content (or alone if content absent by definition of classification but still within transactional boundary for atomicity).

## Indices & Performance

- Primary lookup pattern: list attempts for a plan (reverse chronological) → `plan_id, created_at DESC` supported by `plan_id` index + sorting.
- Future pruning: `created_at` index supports range deletes.

## Open Considerations (Deferred)

- Add partial index for recent attempts (last 7 days) if volume grows.
- Add usage fields (tokens) once provider integrated.
