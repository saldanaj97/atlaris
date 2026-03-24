# RLS JWT claim transaction stability

- [x] Add `tests/integration/db/rls-claim-transaction-stability.spec.ts` (scenarios 1–5)
- [x] Run `pnpm vitest run --project integration tests/integration/db/rls-claim-transaction-stability.spec.ts`
- [x] Run `npx tsc --noEmit` and `npx biome check` on changed files
- [x] Update `docs/technical-debt.md` (lines 34–42) from test outcome + link to spec
- [x] Commit with Conventional Commits (`test:` / `docs:`)

## Review

- **Outcome:** Session `request.jwt.claims` stayed stable across baseline, simple transaction, advisory lock, RLS `SELECT`, and nested transaction in **Testcontainers Postgres** (all five tests passed).
- **Docs:** `docs/technical-debt.md` updated with link to the spec, Neon caveat, and follow-up to remove re-apply when production parity is confirmed.
