# Phase 1: Runtime Foundation — Research & Implementation Plans

> **Parent PRD:** [plan.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/plan.md)
> **Execution tracker:** [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
> **Research date:** 2026-04-02
> **Status:** Research complete — ready for implementation

---

## Slice 1: Smoke Runtime and Ephemeral DB Lifecycle

### 1. Current State

The repo already has most of the disposable-DB plumbing, but it is wired to Vitest global setup instead of a top-level smoke wrapper:

- [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L5) has no smoke command at all; the only DB/bootstrap entry points are `db:dev:*`, which are for the long-lived local dev database.
- [tests/setup/testcontainers.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/setup/testcontainers.ts#L16) already starts a Postgres 17 container, runs `bootstrapDatabase()`, applies `pnpm db:migrate`, grants RLS permissions, and writes connection metadata to `.testcontainers-env.json` in the repo root at [tests/setup/testcontainers.ts:37]( /Users/juansaldana/Dev/Projects/atlaris/tests/setup/testcontainers.ts#L37 ).
- [tests/setup/test-env.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/setup/test-env.ts#L10) reads that temp JSON file back into worker env when Vitest process inheritance is not enough.
- [tests/helpers/db/bootstrap.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/bootstrap.ts#L15) provides the reusable Neon-like bootstrap logic, and [tests/helpers/db/bootstrap.ts:43]( /Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/bootstrap.ts#L43 ) provides post-migration grants plus the authenticated-column grant assertion.
- [tests/helpers/db/seed-local-product-testing.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/seed-local-product-testing.ts#L14) idempotently inserts the canonical seeded local product-testing user.
- [scripts/bootstrap-local-db.ts](/Users/juansaldana/Dev/Projects/atlaris/scripts/bootstrap-local-db.ts#L75) explicitly loads `.env.local` and targets the long-lived localhost dev DB. That is acceptable for `pnpm db:dev:bootstrap` and unacceptable for browser smoke.
- [drizzle.config.ts](/Users/juansaldana/Dev/Projects/atlaris/drizzle.config.ts#L4) also loads `.env.local` outside CI, but it does not pass `override: true`; child-process env overrides still win as long as the smoke wrapper sets them before invoking `pnpm db:migrate`.

Current runtime behavior and gaps:

- Disposable DB setup exists only inside Vitest project setup; there is no outer wrapper that owns the DB lifecycle for Playwright.
- The existing temp-state contract writes `.testcontainers-env.json` into repo state; that works for Vitest and is the wrong place for a top-level smoke harness.
- The long-lived local bootstrap path is intentionally coupled to `.env.local`, so reusing it for smoke would reintroduce the exact machine-state coupling this PRD is trying to eliminate.
- `tests/setup/testcontainers.ts` uses `NODE_ENV=test` only for migrations at [tests/setup/testcontainers.ts:45]( /Users/juansaldana/Dev/Projects/atlaris/tests/setup/testcontainers.ts#L45 ); that is fine for DB setup and must not leak into `next dev` browser app processes later.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L5) | Add `test:smoke` entry point that runs the outer smoke wrapper, not Vitest smoke | 5-32 |

**Reference-only files to reuse, not reshape unless implementation hits a hard blocker:**

| File | Why it matters | Lines |
|------|----------------|-------|
| [tests/setup/testcontainers.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/setup/testcontainers.ts#L16) | Existing container/bootstrap sequence to mirror, not own | 16-121 |
| [tests/helpers/db/bootstrap.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/bootstrap.ts#L15) | Shared bootstrap + grant helpers | 15-95 |
| [tests/helpers/db/seed-local-product-testing.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/seed-local-product-testing.ts#L14) | Canonical seeded user insert | 14-44 |
| [scripts/bootstrap-local-db.ts](/Users/juansaldana/Dev/Projects/atlaris/scripts/bootstrap-local-db.ts#L75) | Explicit anti-pattern for smoke because it loads `.env.local` | 75-98 |

**New files:**

| File | Purpose |
|------|---------|
| `scripts/smoke/run.ts` | Pattern A owner: create disposable DB state, invoke Playwright, guarantee teardown |
| `scripts/smoke/testcontainer.ts` | Start/stop Postgres container and run bootstrap/migration/seed steps |
| `tests/helpers/smoke/state-file.ts` | Serialize and clean up smoke state outside repo state |
| `tests/unit/helpers/smoke/state-file.spec.ts` | Unit coverage for state-file read/write/error handling |

### 3. Implementation Steps (TDD)

1. **Write tests for smoke state handling first:**
   - Test: writing state captures `DATABASE_URL`, `DATABASE_URL_NON_POOLING`, `DATABASE_URL_UNPOOLED`, and wrapper metadata.
   - Test: reading a missing or malformed state file fails fast with a clear error.
   - Test: cleanup removes the temp state artifact.

2. **Implement disposable DB helper next:**
   - Create a dedicated smoke helper instead of mutating [tests/setup/testcontainers.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/setup/testcontainers.ts).
   - Reuse [bootstrapDatabase()](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/bootstrap.ts#L15), [grantRlsPermissions()](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/bootstrap.ts#L43), and [seedLocalProductTestingUser()](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/seed-local-product-testing.ts#L14).
   - Run `pnpm db:migrate` in a child process with only disposable DB URLs injected.
   - Write smoke state to `os.tmpdir()` or equivalent, not repo root.

3. **Implement the outer wrapper:**
   - Create one Postgres container per full `pnpm test:smoke` run.
   - Seed the canonical smoke user after migrations.
   - Pass `SMOKE_STATE_FILE=<temp-path>` into the Playwright child process.
   - Put container shutdown and state-file deletion in `finally`.

4. **Validate infrastructure behavior before browser work:**
   - Add a minimal or infra-only wrapper mode so DB setup can be exercised without browser specs.
   - Confirm the seeded user row exists in the disposable DB.
   - Confirm rerunning the wrapper gives a fresh DB rather than mutating persistent local state.

### 4. Risk Areas

- **Behavioral change:** MEDIUM — local browser smoke stops using `atlaris_dev` and starts using a disposable DB per run.
- **Resource leak risk:** HIGH — if `finally` teardown is incomplete, Docker containers and temp state files will accumulate.
- **Configuration risk:** MEDIUM — reusing [scripts/bootstrap-local-db.ts](/Users/juansaldana/Dev/Projects/atlaris/scripts/bootstrap-local-db.ts#L75) would quietly reintroduce `.env.local` coupling.
- **Migration risk:** LOW — [drizzle.config.ts](/Users/juansaldana/Dev/Projects/atlaris/drizzle.config.ts#L4) loads `.env.local`, but smoke child-process env should still win because dotenv is not overriding existing values.

### 5. Estimated Overlap

- **With Slice 2:** direct overlap on the smoke state file contract and launcher env consumption.
- **Merge recommendation:** land Slice 1 first. Slice 2 should not exist until the disposable DB contract is real.

---

## Slice 2: Mode-Specific App Launchers

### 1. Current State

The app already supports process-start mode separation without product code changes:

- [src/lib/config/env.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/config/env.ts#L118) treats blank strings as fallback/undefined via `toBoolean()` and `optionalEnv()`, which is why `DEV_AUTH_USER_ID=''` is the correct anon-mode value.
- [src/lib/config/env.ts:199]( /Users/juansaldana/Dev/Projects/atlaris/src/lib/config/env.ts#L199 ) avoids env caching in non-production runtimes, so development/test reads stay dynamic.
- [src/lib/config/env.ts:324]( /Users/juansaldana/Dev/Projects/atlaris/src/lib/config/env.ts#L324 ) respects explicit `APP_URL` before falling back to `http://localhost:3000`.
- [src/lib/config/env.ts:639]( /Users/juansaldana/Dev/Projects/atlaris/src/lib/config/env.ts#L639 ) exposes `localProductTestingEnv`, and [src/lib/config/env.ts:656]( /Users/juansaldana/Dev/Projects/atlaris/src/lib/config/env.ts#L656 ) exposes `devAuthEnv`.
- [src/proxy.ts](/Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L29) protects `/dashboard`, `/api`, `/plans`, `/account`, `/settings`, and `/analytics`.
- [src/proxy.ts:144]( /Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L144 ) only enables the local-product-testing page bypass when `appEnv.isDevelopment`, `DEV_AUTH_USER_ID` is defined, and `LOCAL_PRODUCT_TESTING=true`.
- [src/lib/api/auth.ts:27]( /Users/juansaldana/Dev/Projects/atlaris/src/lib/api/auth.ts#L27 ) resolves `DEV_AUTH_USER_ID` before real Neon session lookup in development/test.
- [src/lib/api/auth.ts:78]( /Users/juansaldana/Dev/Projects/atlaris/src/lib/api/auth.ts#L78 ) throws if local product testing is enabled but the seeded user row does not exist.
- [src/lib/auth/local-identity.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/auth/local-identity.ts#L7) keeps shell/header identity aligned with the same env-driven local identity.

Non-obvious implementation constraints discovered during research:

- The browser app server must stay in development runtime. If the launcher forces `NODE_ENV=test`, [src/proxy.ts:145]( /Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L145 ) and [src/proxy.ts:150]( /Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L150 ) will not apply the local bypasses.
- The seeded smoke user starts free tier, so browser smoke cannot blindly accept the plan-form default deadline of `4` weeks later in the suite.
- PDF smoke will eventually need explicit AV behavior; [src/features/pdf/security/scanner-factory.ts:24]( /Users/juansaldana/Dev/Projects/atlaris/src/features/pdf/security/scanner-factory.ts#L24 ) defaults to `AV_PROVIDER=none`, which is acceptable but implicit. For this workflow, launcher-owned `AV_PROVIDER=mock` and `AV_MOCK_SCENARIO=clean` is the more explicit contract.

Feasibility already proved in this repo:

- anon startup with `DEV_AUTH_USER_ID=''` and `LOCAL_PRODUCT_TESTING=false` returned `307` to `/auth/sign-in`
- auth startup with the seeded user id plus local billing mock env returned `200` for `/dashboard` and `/pricing`

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L5) | Add launcher-facing smoke scripts if you want lower-level entry points in addition to `test:smoke` | 5-32 |

**Reference-only files to target, not rewrite unless implementation proves them insufficient:**

| File | Why it matters | Lines |
|------|----------------|-------|
| [src/lib/config/env.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/config/env.ts#L118) | Env parsing and dev/local-product-testing switches | 118-135, 199-245, 324-352, 639-666 |
| [src/proxy.ts](/Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L29) | Protected prefixes and development-only bypass logic | 29-47, 137-163 |
| [src/lib/api/auth.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/api/auth.ts#L27) | Effective auth resolution and seeded-user requirement | 27-44, 78-82, 226-243 |
| [src/features/pdf/security/scanner-factory.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/pdf/security/scanner-factory.ts#L24) | AV provider selection for later PDF smoke | 24-60 |

**New files:**

| File | Purpose |
|------|---------|
| `scripts/smoke/start-app.ts` | Start `next dev --turbopack` for `anon` or `auth` mode |
| `tests/helpers/smoke/mode-config.ts` | Single readable source of truth for mode-specific env maps |
| `scripts/smoke/read-state.ts` | Load disposable DB metadata produced by Slice 1 |
| `tests/unit/helpers/smoke/mode-config.spec.ts` | Unit coverage for anon/auth env maps and merge behavior |

### 3. Implementation Steps (TDD)

1. **Write tests for mode config first:**
   - Test: anon mode emits `DEV_AUTH_USER_ID=''`, `LOCAL_PRODUCT_TESTING=false`, `APP_URL`, `PORT`, and disposable DB env.
   - Test: auth mode emits the seeded auth user id, `LOCAL_PRODUCT_TESTING=true`, `STRIPE_LOCAL_MODE=true`, `MOCK_AI_SCENARIO=success`, `AV_PROVIDER=mock`, `AV_MOCK_SCENARIO=clean`, `APP_URL`, `PORT`, and disposable DB env.
   - Test: launcher preserves development runtime for `next dev`.

2. **Implement launcher modules:**
   - Read the smoke state file from Slice 1.
   - Merge inherited process env with explicit mode overrides.
   - Keep mode configuration in one obvious object so implementation does not hide env differences across files.
   - Spawn `next dev --turbopack` on fixed ports for anon and auth.

3. **Validate with real process behavior:**
   - Start anon and auth launchers independently against the same disposable DB.
   - Verify anon `/dashboard` and `/plans` redirects.
   - Verify auth `/dashboard` and `/pricing` load cleanly.
   - Verify `.env.local` remains untouched before and after launcher runs.

### 4. Risk Areas

- **Behavioral risk:** HIGH — wrong launcher env means fake confidence; the browser may look “auth” or “anon” for the wrong reason.
- **Runtime risk:** HIGH — forcing `NODE_ENV=test` on the app server would break local bypass behavior because [src/proxy.ts:145]( /Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L145 ) gates bypasses on development runtime.
- **Ambiguity risk:** MEDIUM — relying on implicit AV defaults would make later PDF smoke behavior harder to reason about.
- **Docs drift:** MEDIUM — [scripts/test-plan-generation.sh](/Users/juansaldana/Dev/Projects/atlaris/scripts/test-plan-generation.sh#L9) and older smoke docs still talk about `.env.local` toggles and will mislead future work until Phase 3 docs cleanup lands.

### 5. Estimated Overlap

- **With Slice 1:** state-file contract and DB env propagation are shared.
- **With Phase 2 runner setup:** Playwright `webServer` commands will call the launcher directly.
- **Merge recommendation:** land immediately after Slice 1. Browser-runner work is blocked on this contract.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Phase 1
  1. Smoke Runtime and Ephemeral DB Lifecycle
     └── 2. Mode-Specific App Launchers
```

**Rationale:** Slice 2 is meaningless without a disposable DB contract and smoke state file. Implementing launchers first just recreates the old “use whatever local state happens to be there” failure mode.

### Shared File Map

| File | Slice 1 | Slice 2 |
|------|---------|---------|
| [package.json](/Users/juansaldana/Dev/Projects/atlaris/package.json#L5) | ✅ command surface | ✅ command surface |
| `scripts/smoke/run.ts` | ✅ primary owner | consumes launcher contract indirectly |
| `tests/helpers/smoke/state-file.ts` | ✅ primary owner | ✅ reads state |
| `scripts/smoke/start-app.ts` | — | ✅ primary owner |
| [tests/helpers/db/bootstrap.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/helpers/db/bootstrap.ts#L15) | ✅ reused | — |
| [src/proxy.ts](/Users/juansaldana/Dev/Projects/atlaris/src/proxy.ts#L137) | — | ✅ runtime contract |
