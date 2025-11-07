<!-- d7ceed70-c5ca-4586-bfbc-cd1d90ac1bd9 558869df-89ba-43e3-ad3f-d0bfdf91b081 -->

# Harden task descriptions (sanitize) and remove HTML markers

## Decisions

- Keep UI as plain text (no Markdown). Sanitize on write; render as escaped text as today.
- Replace HTML comment marker with a boolean flag on `tasks` to prevent duplicate micro-explanations.

## Scope

- DB schema, migration/backfill, queries update, worker logic update, tests, and docs.

## Changes

### 1) Database schema

- In `src/lib/db/schema.ts` add `hasMicroExplanation` (boolean, default `false`, not null) to `tasks`.
- Generate migration to:
  - Add `has_micro_explanation boolean not null default false`.
  - Backfill: set flag where legacy marker exists and strip the marker from `description`.

Example backfill (conceptual):

```
-- Set flag when legacy marker is present
update tasks
set has_micro_explanation = true
where description like '%<!-- micro-explanation-% -->%'
   or description like '%<!-- micro-explanation-%\n%';

-- Remove the comment marker text only (keep the explanation body)
-- If marker format was: `<!-- micro-explanation-<id> -->\n<explanation>`
update tasks
set description = regexp_replace(description, '<!-- micro-explanation-[^>]+ -->\n?', '', 'g');
```

### 2) Write path sanitization

- Create `sanitizePlainText(input: string): string` in `src/lib/utils/sanitize.ts`:
  - Strip all HTML tags/comments.
  - Normalize newlines to `\n`; trim; collapse excessive blank lines.
  - Enforce max length (e.g., 10k chars) with safe truncation.
- Ensure all description writes use it.

### 3) Queries API changes

- In `src/lib/db/queries/tasks.ts`:
  - Update `appendTaskDescription(taskId, additional)` to sanitize `additional` and existing text prior to persistence.
  - Add `appendTaskMicroExplanation(taskId, text)` that:
    - If `hasMicroExplanation` is true, no-op.
    - Else sanitize `text`, append to `description` with a simple plain-text prefix (e.g., `\n\nMicro-explanation\n`), set `hasMicroExplanation = true`.

### 4) Worker logic

- In `src/lib/jobs/worker-service.ts`:
  - Stop injecting HTML comment marker.
  - Call `appendTaskMicroExplanation` instead of `appendTaskDescription` for micro-explanations.

### 5) UI and integrations

- UI (`src/components/plans/PlanModuleCard.tsx`) remains unchanged (still renders as plain text).
- Notion export (`src/lib/integrations/notion/mapper.ts`) already passes plain text to `rich_text.text.content` — no change needed.

### 6) Tests

- Unit: `sanitizePlainText` cases (tags stripped, comments removed, length capped, newlines normalized).
- Unit: `appendTaskDescription` sanitizes inputs and preserves existing content.
- Unit: `appendTaskMicroExplanation` sets flag and does not re-append when already set.
- Integration: worker appends micro-explanation once without markers; legacy records with markers retain explanation but no markers after migration.
- Regression: UI renders `<script>` and `<b>` as literals, not HTML.

### 7) Docs

- Update `specs/010-security-audit/security_audit_results.md` finding #2 with resolution notes and rationale.

## Rollout

1. Create schema + migration, run migration locally and test DB.

2. Apply code changes (queries, worker, utils), run targeted unit/integration tests.

3. Deploy migration first; then deploy app code.

4. Monitor logs for worker micro-explanation path; verify no duplicate inserts.

### To-dos

- [ ] Add hasMicroExplanation boolean to tasks in schema and create migration
- [ ] Backfill: set flag for legacy markers and strip markers from descriptions
- [ ] Implement sanitizePlainText utility for plain text normalization
- [ ] Update appendTaskDescription to sanitize inputs before persistence
- [ ] Add appendTaskMicroExplanation with flag check and sanitization
- [ ] Update worker to use appendTaskMicroExplanation and drop markers
- [ ] Add unit tests for sanitization and query behaviors
- [ ] Add integration tests for worker micro-explanations and migration backfill
- [ ] Update security audit doc with resolution for finding #2
