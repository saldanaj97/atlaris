# Lessons Learned

## 2026-03-17: PRD audits miss violations when done manually

**Context:** PRD #243 identified 9 `lib/ → features/` violations, but a full `grep` audit found 27 total imports across 17 files — 13 additional violations were missed.

**Rule:** When writing a PRD that addresses dependency violations or import restructuring, always run an automated search (e.g., `grep -r "from '@/features/" src/lib/`) to discover ALL violations. Don't rely on manual code reading alone.

**Impact:** Without the full audit, ESLint enforcement (#271) would have failed after completing all 9 original issues because 13 violations would still exist.
