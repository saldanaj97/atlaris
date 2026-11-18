# Learnings

- Owner-writable tables (users insert and update their own rows, like `task_progress` and `lesson_problem_reports`) are not covered by `supabase/AGENTS.md` "Adding a table": mirror `task_progress` in the migration grants, `scripts/db/attest-effective-privileges.sql`, `tests/helpers/db/bootstrap.ts`, `tests/helpers/db/rls-bootstrap.ts`, and the update-column pin in `tests/security/effective-privileges-attestation.spec.ts`.
