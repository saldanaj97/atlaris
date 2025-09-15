# Database Testing (pgTAP + Basejump Helpers)

Concise guide for testing our Supabase Postgres schema: fast, deterministic verification of RLS, schema structure, and business logic using pgTAP plus the Basejump Supabase Test Helpers. Focus: database authorization & logic only (app-layer auth / Clerk flows are out of scope; user identity is simulated to exercise RLS).

## Helper Layer (Basejump) – What It Provides

| Capability                 | Helpers / Functions                                            | Notes                                                |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Create deterministic users | `tests.create_supabase_user(email [, password])`               | Avoids manual inserts into `auth.users`.             |
| Switch auth context        | `tests.authenticate_as(email)`, `tests.clear_authentication()` | Simulates logged-in / anonymous states.              |
| Service-role bypass        | `tests.authenticate_as_service_role()`                         | Seed data that must ignore RLS.                      |
| Resolve user id            | `tests.get_supabase_uid(email_or_username)`                    | Stable FK usage in fixtures.                         |
| Schema-wide RLS check      | `tests.rls_enabled(schema)`                                    | Ensures tables with sensitive data have RLS enabled. |
| Time control               | `tests.freeze_time(ts)`, `tests.unfreeze_time()`               | For time-based policies.                             |

Pair with pgTAP assertions: `ok`, `lives_ok`, `throws_ok`, `results_eq`, `results_ne`, `plan`, `finish`.

## Layout & Assumptions

- Test files live in `supabase/tests/database/` (Supabase CLI convention).
- CLI flow: ephemeral DB -> apply migrations -> execute test SQL in lexical order.
- Only migrations & SQL matter here (Next.js / Drizzle code not executed).

## Prerequisites

- Supabase CLI installed.
- All migrations apply cleanly locally.
- Extensions: `pg_tle`, `http` (pgsql-http) available; pre-test hook installs what’s missing idempotently.

## Pre-test Hook (Runs First)

File: `supabase/tests/database/000-setup-tests-hooks.sql` – installs extensions + Basejump, then a sanity assertion. Runs first due to numeric prefix.

```sql
-- Install pgTAP and prerequisites (idempotent)
create extension if not exists pgtap with schema extensions;
create extension if not exists http with schema extensions; -- pgsql-http
create extension if not exists pg_tle;                      -- TLE for dbdev

-- Install/refresh dbdev (Postgres package manager) using pg_tle + http
-- Note: To avoid hardcoding an API token, prefer a secure variable or follow the
-- database.dev docs for the latest recommended install snippet.
-- The pattern is:
--   1) uninstall supabase-dbdev if present
--   2) fetch latest package SQL from database.dev over HTTP
--   3) pgtle.install_extension('supabase-dbdev', version, description, sql)
--   4) create extension "supabase-dbdev"; then select dbdev.install('supabase-dbdev');

-- Drop/reinstall to ensure a clean install (safe in test db)
drop extension if exists "supabase-dbdev";
select pgtle.uninstall_extension_if_exists('supabase-dbdev');

-- Example skeleton for installing supabase-dbdev from database.dev
-- (Use the official docs for the exact http() call and headers)
-- with resp as (
--   select ((row_to_json(x)->'content')#>>'{}')::json->0 as contents
--   from http(
--     'GET',
--     'https://api.database.dev/rest/v1/package_versions?select=sql,version&package_name=eq.supabase-dbdev&order=version.desc&limit=1',
--     array[('apiKey', '<database.dev_public_api_key>')::http_header],
--     null,
--     null
--   ) x
-- )
-- select pgtle.install_extension(
--   'supabase-dbdev',
--   (resp.contents->>'version'),
--   'PostgreSQL package manager',
--   (resp.contents->>'sql')
-- ) from resp;

create extension if not exists "supabase-dbdev";
select dbdev.install('supabase-dbdev');

-- Recreate to ensure the extension is the active instance
drop extension if exists "supabase-dbdev";
create extension "supabase-dbdev";

-- Install the Basejump Supabase Test Helpers package
-- Pin to a known-good version or omit version to use latest available in dbdev
select dbdev.install('basejump-supabase_test_helpers');
create extension if not exists "basejump-supabase_test_helpers";

-- Verify setup with a one-assertion sanity check
begin;
select plan(1);
select ok(true, 'Pre-test hook completed successfully');
select * from finish();
rollback;
```

Benefits: single dependency point, early failure signal, no boilerplate duplication.

## Quick RLS Coverage (Schema-Wide)

Check every table in a schema enforces RLS:

```sql
begin;
select plan(1);
select tests.rls_enabled('public');
select * from finish();
rollback;
```

## Focused RLS Test Pattern

Each file: `begin; plan(n); ... assertions ...; finish(); rollback;` (isolated & repeatable). Example:

```sql
-- 001-rls-todos.sql
begin;
select plan(4);

-- Arrange: create two users and some rows owned by them
select tests.create_supabase_user('user1@test.com');
select tests.create_supabase_user('user2@test.com');

insert into public.todos (task, user_id) values
  ('User 1 Task 1', tests.get_supabase_uid('user1@test.com')),
  ('User 1 Task 2', tests.get_supabase_uid('user1@test.com')),
  ('User 2 Task 1', tests.get_supabase_uid('user2@test.com'));

-- Act + Assert: as user1
select tests.authenticate_as('user1@test.com');
select results_eq(
  'select count(*) from todos',
  array[2::bigint],
  'user1 sees only their two todos'
);
select lives_ok(
  $$insert into todos (task, user_id)
      values ('New Task', tests.get_supabase_uid('user1@test.com'))$$,
  'user1 can insert their own row'
);

-- Act + Assert: as user2
select tests.authenticate_as('user2@test.com');
select results_eq(
  'select count(*) from todos',
  array[1::bigint],
  'user2 sees only their one todo'
);
select results_ne(
  $$update todos set task = 'Hacked!'
        where user_id = tests.get_supabase_uid('user1@test.com')
        returning 1$$,
  $$values(1)$$,
  'user2 cannot modify user1 rows'
);

select * from finish();
rollback;
```

Tips: service role for privileged setup; freeze time for temporal rules; separate pure policy vs business rule assertions when they grow.

## File Organization

`000-setup-tests-hooks.sql` (global setup)
`010-policies-structure.sql` (structural RLS assertions)  
`020-<table>-read.sql` (visibility)  
`030-<table>-write.sql` (mutation permissions)  
`040-cross-table.sql` (membership / joins)  
`050-regressions.sql` (fixed bugs)

All files transactional.

## Running Tests

CLI spins up temp DB, applies migrations, executes tests.

Run all:

```sh
supabase test db
```

Single file:

```sh
supabase test db --file supabase/tests/database/001-rls-todos.sql
```

Extension errors? Revisit pre-test hook / update local images.

## Practices & Pitfalls

- Enable RLS on sensitive tables; assert with `tests.rls_enabled()`.
- Use SECURITY DEFINER helpers (in private schema) to avoid recursive RLS.
- Deterministic fixtures > randomness (unless testing randomness itself).
- Pin helper package versions for reproducibility when needed.
- Keep `plan(n)` truthful; add assertions—update plan.
- Keep tests small & descriptive.

## Helper & Assertion Quick Ref

Users: `create_supabase_user`, `authenticate_as`, `clear_authentication`, `authenticate_as_service_role`  
IDs: `get_supabase_uid`  
RLS coverage: `rls_enabled`  
Time: `freeze_time`, `unfreeze_time`  
Assertions: `ok`, `lives_ok`, `throws_ok`, `results_eq`, `results_ne`, `plan`, `finish`

## Advanced RLS Policy Testing (Slim)

Two-layer model: (1) Structural DDL fidelity, (2) Behavioral data outcomes.

### 1. Structural checks

Catch drift _early_.

`policies_are` (exact set), `policy_roles_are` (role set), `policy_cmd_is` (command scope). Keep isolated from behavioral tests.

Example:

```sql
begin;
select plan(3);

-- Table: profiles
select policies_are(
  'public', 'profiles',
  array[
    'Profiles are public',
    'Profiles can only be updated by the owner'
  ]
);
select policy_roles_are('public','profiles','Profiles are public', array['public']);
select policy_cmd_is('public','profiles','Profiles can only be updated by the owner','UPDATE');

select * from finish();
rollback; -- leaves schema pristine
```

Keep `plan(n)` accurate.

### 2. Behavioral checks

Patterns: visibility matrix, mutation authorization, exact set validation (`results_eq` + ORDER BY if needed), denial validation (`throws_ok` expecting 42501).

### Suggested layering

010 structure / 020 read / 030 write / 040 cross-table / 050 regressions

### Policy naming

Format: `<Table> <action phrase>` ("Profiles are public", "Todos can be updated by owner"). Use stable verbs.

### Failure interpretation

`policies_are` extra -> stray policy or stale migration.  
`policies_are` missing -> dropped/renamed policy.  
`policy_roles_are` mismatch -> unintended role change.  
`policy_cmd_is` mismatch -> scope broadened/narrowed.  
`results_eq` mismatch (structure ok) -> logic / fixture issue.  
`throws_ok` now `lives_ok` -> policy became permissive.

### Edge cases

ALL policy replacements; NULL ownership rows; time-based predicates (freeze time); SECURITY DEFINER helper validation (`function_returns`, `is_definer`); optional `has_index` for perf-sensitive predicates.

### Stable expected sets

Prefer simplest form:

```sql
-- Single column count check
select results_eq('select count(*) from todos where user_id = tests.get_supabase_uid(''user1@test.com'')',
                  array[2::bigint],
                  'user1 sees only own todos');

-- Multi-column deterministic listing
select results_eq(
  $$select id, task from todos where user_id = tests.get_supabase_uid('user1@test.com') order by task$$,
  $$values (uuid '00000000-0000-0000-0000-000000000001','Task A'),
              (uuid '00000000-0000-0000-0000-000000000002','Task B')$$,
  'expected task set for user1'
);
```

### Tiny combined example

Small domains may merge structural + behavior:

```sql
begin;
select plan(5);

-- Structural (2 asserts)
select policies_are('public','profiles', array['Profiles are public','Profiles can only be updated by the owner']);
select policy_cmd_is('public','profiles','Profiles can only be updated by the owner','UPDATE');

-- Seed & behavior (3 asserts)
select tests.create_supabase_user('a@test.com');
select tests.authenticate_as('a@test.com');
select results_eq('select count(*) from profiles', array[3::bigint], 'anonymous/public visibility baseline');
select throws_ok($$update profiles set full_name = 'Hack' where id <> tests.get_supabase_uid('a@test.com') returning 1$$,'42501','cannot update others');
select lives_ok($$update profiles set full_name = 'Self' where id = tests.get_supabase_uid('a@test.com')$$,'self update allowed');

select * from finish();
rollback;
```

### When to refactor

> 20 assertions in one file; frequent policy name churn; repeated setup (abstract earlier).

### Summary

RLS tests = schema contracts: structural layer prevents silent DDL drift; behavioral layer guarantees actual data protection.

## Sources and further reading

- Supabase: Advanced pgTAP Testing (pgTAP Extended)
- Database.dev registry and Basejump Test Helpers
- RLS testing techniques and best practices

These evolve quickly; refer to the upstream docs for the latest install snippet and versions.
