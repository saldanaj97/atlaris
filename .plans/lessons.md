# Lessons Learned

## 2026-03-17: PRD audits miss violations when done manually

**Context:** PRD #243 identified 9 `lib/ → features/` violations, but a full `grep` audit found 27 total imports across 17 files — 13 additional violations were missed.

**Rule:** When writing a PRD that addresses dependency violations or import restructuring, always run an automated search (e.g., `grep -r "from '@/features/" src/lib/`) to discover ALL violations. Don't rely on manual code reading alone.

**Impact:** Without the full audit, ESLint enforcement (#271) would have failed after completing all 9 original issues because 13 violations would still exist.

## 2026-04-05: Planning path drift from `prds/` to `.plans/`

**Context:** A planning task initially created a new workspace under `prds/` because older learnings and docs still referenced that path, while the root `AGENTS.md` had already moved the canonical location to `.plans/`.

**Rule:** Before creating or updating planning artifacts, verify the canonical planning directory in the live root `AGENTS.md`. In this repo, use `.plans/`, not `prds/`.

**Impact:** Following stale path references creates duplicate planning trees, confuses future updates, and undermines the workflow the repo is explicitly trying to standardize.

## 2026-04-05: Verify active surface area before planning around it

**Context:** The authenticated-request-scope research initially treated dead or internal-only helpers as active public primitives, and `docs/agent-context/learnings.md` preserved a server-component rule for `getCurrentUserRecordSafe()` even though the function had 0 callers and had already caused a regression when chosen over `withServerComponentContext()`.

**Rule:** Before turning helper-selection rules into planning assumptions or durable learnings, verify external call sites and classify exports as active, internal-only, escape hatch, or dead code.

**Impact:** This keeps planning artifacts focused on the real migration surface and prevents stale docs from preserving already-rejected usage patterns.
