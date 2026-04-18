# Meta and tooling

## Scope

- **Repository:** entire workspace (`atlaris`), emphasis on `src/`.
- **Mode:** findings only — no edits, no dependency installs committed, no `jscpd` report written to disk (configured output would mutate the tree).

## Branch / commit strategy

- **N/A** — report-only run; skill’s “one commit per track” was not applied.

## Implementation threshold

- **Report-only:** all recommendations are unimplemented pending your review.

## Languages and tools detected

| Tool | Status |
|------|--------|
| **pnpm** | Present (`package.json`). |
| **TypeScript** | Present; `pnpm check:type` uses `tsgo --noEmit`. |
| **Biome** | `pnpm check:lint`, `check:format`. |
| **Vitest** | Test runner via `scripts/tests/run.ts`. |
| **jscpd** | In `devDependencies`; `.jscpd.json` targets `src/`, writes `./jscpd-report` — not run in this audit to avoid writes. |
| **knip** | Not in `package.json`. Subagent attempted `pnpm dlx knip`; **failed** with `EPERM` on pnpm dlx cache (environment). |

## Follow-up when implementing

- Run **knip** locally (or in CI) with Next-aware config after fixing cache permissions.
- Run **jscpd** with stdout-only or a gitignored output dir if you want clone metrics.
