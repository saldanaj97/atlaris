# Learnings

Persistent user preferences and durable workspace facts maintained by the `continual-learning` skill. **Whenever you read or follow [`AGENTS.md`](../../AGENTS.md), read this file as well.**

## Learned User Preferences

- When implementing from an attached PRD plan, do not edit the plan file; track work in `prds/<prd-name>/todos.md` and existing todo items instead.
- When a plan specifies a commit order or split (e.g. migration vs tests), match that order in git commits.
- If the user says not to push yet, commit locally only and do not push or assume remote updates.
- When asked to run tests, prefer scoped commands (e.g. `pnpm test:changed` or a single spec file); do not run the full integration or full suite if the user asks to limit scope.
- Before changing code for review-bot or external findings, verify each item against the current tree so fixes stay accurate and minimal.
- When the working tree mixes changes from multiple agents or tasks, commit only files that belong to the current workstream (inspect `git status` / `git diff` before staging).
- For substantial implementation plans, surface multiple viable approaches where tradeoffs differ so the user can choose before coding.

## Learned Workspace Facts

- PostgreSQL RLS controls which rows a role can see or change; it does not restrict which columns may be updated. Column-level writes use `GRANT` / `REVOKE` on columns (or table-level privileges), not RLS alone.
- Privilege changes that are not modeled in Drizzle schema belong in hand-written SQL migrations; keep the same `REVOKE`/`GRANT` logic in migration, the canonical TS allowlist under `src/lib/db/privileges/` when used, `tests/helpers/db` bootstrap, testcontainers `grantRlsPermissions`, and CI grant steps when they must stay in lockstep.
- Ephemeral Postgres for security/integration tests applies migrations via `pnpm db:migrate` so `pg_policy` and related objects match the migration chain; relying on `drizzle-kit push` alone can drift from migration-defined policy text.
- RLS policy tests (`pnpm test:security` / `vitest --project security`) always run the real suite when invoked; they require Docker (Testcontainers). There is no environment variable to skip that suite.
- GitHub `ci-pr.yml` and `ci-trunk.yml` include a `security-tests` job for that suite. Trunk path filters that gate integration-style jobs include `tests/security/**`, `tests/helpers/**`, and `tests/setup/**` so shared test infra changes trigger the right CI runs.
- RLS security tests that assert permission failures should use helpers that account for Drizzle-wrapped Postgres errors (e.g. a shared `expectRlsViolation` that inspects message/cause), not only `rejects.toThrow(/permission denied/)`.
- `src/lib/db/privileges/` is for migration-aligned privilege metadata such as column allowlists; large procedural RLS bootstrap SQL stays under `tests/helpers/db/` (e.g. `rls-bootstrap.ts`), not under `privileges/`.
- Optional local duplication audits: `pnpm run dup-check` runs jscpd using `.jscpd.json`; generated reports live under `jscpd-report/` and should stay gitignored.
- For the Vitest `integration` project, `tests/setup/db.ts` runs `resetDbForIntegrationTestFile()` in a global `beforeEach` (unless `SKIP_DB_TEST_SETUP=true`); per-file hooks that only repeat the same reset add cost without improving isolation.
- Drizzle `CHECK` constraints that cap `char_length` should use literal numeric values in `sql` fragments in schema files (avoid interpolating TS constants into `sql` templates for those limits) so generated migration snapshots stay stable; keep caps in `src/lib/db/schema/constants.ts` and validate alignment with drift tests (e.g. title-length specs).
- The `preferred_ai_model` database enum omits `openrouter/free` even when runtime tier defaults may use that catalog id — persistable settings options and saved-value validation must exclude it and keep tier/runtime fallback separate from “saved preference.”
