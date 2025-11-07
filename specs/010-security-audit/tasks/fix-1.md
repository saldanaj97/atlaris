<!-- 0c7fb5cf-3871-4e99-8e5f-317a5de4baf0 7d2bb698-aa70-436d-b2ac-3b4de43dd853 -->

# Remediate raw SQL in job queue (parameterize + guard)

## What we'll do

- Replace the raw SQL array literal in `src/lib/jobs/queue.ts` with a parameterized `inArray` condition.
- Remove `buildJobTypeArrayLiteral` and add a runtime whitelist guard for `types`.
- Add a unit test that ensures invalid job types are rejected before any SQL hits the DB.
- Keep existing behavior and locking semantics intact.

## Files to change

- `src/lib/jobs/queue.ts`
- `src/lib/jobs/__tests__/queue.test.ts` (new test only)

## Edits (essential snippets)

- In `src/lib/jobs/queue.ts`:
  - Import `inArray` and remove the helper.
  - Add a small guard before building the query.

```ts
// import update
import { and, desc, eq, gte, sql, inArray } from 'drizzle-orm';
// ...
// delete:
// function buildJobTypeArrayLiteral(types: JobType[]): string { ... }

// add above getNextJob or inline inside it
import { JOB_TYPES, type JobType } from './types';
const ALLOWED_JOB_TYPES = new Set(Object.values(JOB_TYPES));
function assertValidJobTypes(
  values: readonly unknown[]
): asserts values is JobType[] {
  if (
    !values.every(
      (v) => typeof v === 'string' && ALLOWED_JOB_TYPES.has(v as JobType)
    )
  ) {
    throw new Error('Invalid job type(s) received');
  }
}

export async function getNextJob(types: JobType[]): Promise<Job | null> {
  if (types.length === 0) return null;
  assertValidJobTypes(types);

  const startTime = new Date();
  const result = await db.transaction(async (tx) => {
    const typeFilter = inArray(jobQueue.jobType, types);
    const rows = (await tx.execute(sql`
      select id
      from job_queue
      where status = 'pending'
        and ${typeFilter}
        and scheduled_for <= now()
      order by priority desc, created_at asc
      limit 1
      for update skip locked
    `)) as Array<{ id: string }>;
    // ... unchanged update + returning logic
  });
  return result;
}
```

- In `src/lib/jobs/__tests__/queue.test.ts`:
  - Add a test to enforce the guard and ensure no raw SQL injection surface:

```ts
it('rejects invalid job types before query execution', async () => {
  // Deliberately bypass TS at call site
  // @ts-expect-error – testing runtime guard against malformed input
  await expect(getNextJob(['plan_generation" ) or true -- '])).rejects.toThrow(
    'Invalid job type'
  );
});
```

## Notes

- This aligns with Drizzle docs: avoid `sql.raw()` for dynamic values; use parameterized operators like `inArray` inside `sql` templates.
- Behavior for valid inputs is unchanged; protect against future misuse and runtime enum errors.

## Validation

- Run only related unit tests:
  - `pnpm test:unit:related`
- Lint & type-check:
  - `pnpm lint && pnpm type-check`
- Code review: `coderabbit --prompt-only -t uncommitted`

## Documentation

- Update `specs/010-security-audit/security_audit_results.md` to mark finding #1 as addressed, referencing the commit.

### To-dos

- [x] Replace raw ANY() literal with inArray() in getNextJob()
- [x] Delete buildJobTypeArrayLiteral and add runtime whitelist guard
- [x] Add unit test rejecting invalid job types in queue.test.ts
- [x] Run lint and type-check for changed files
- [x] Run related unit tests for queue
- [x] Run CodeRabbit review, then commit with guidelines
- [x] Update security_audit_results.md to mark finding #1 resolved
- [x] Commit the updated security_audit_results.md file
