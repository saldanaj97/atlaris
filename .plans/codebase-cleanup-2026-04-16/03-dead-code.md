# Track 3: dead-code

## 1) Research notes

**Scope and tools**

- `package.json`: no `knip`, `madge`, or `ts-prune` scripts/deps.
- **Knip:** `pnpm dlx knip --no-progress` attempted; failed with `EPERM` on pnpm dlx cache (sandbox). No Knip output.
- **Path aliases:** `tsconfig.json` maps `@/*` → `./src/*`, `@tests/*` → `./tests/*`.

**Dynamic / non-static usage**

- Dynamic `import()` in `src/instrumentation.ts` (~12–17), auth/DB, **extensively in tests**.
- **`next/dynamic`:** no matches in `src` (per audit).
- Next App Router convention files may have no TS importers but are not dead.

**Spot checks (recent areas)**

- Split validation modules (`stripe.schemas.ts`, `pdf.schemas.ts`, `learningPlans.schemas.ts`) — imported by siblings.
- `src/lib/date/relative-time.ts` — used from plan-utils, activity-utils, unit tests.
- `src/lib/api/error-normalization.ts`, `normalize-unknown.ts` — multiple call sites.
- `src/lib/db/usage.ts`, `jobs-metrics.ts`, `users-authenticated-update-columns.ts` — have importers.

**Dependency-level candidates (ripgrep: no import/require in `*.ts` / `*.tsx` / `*.js`)**

| Package | Notes |
|---------|--------|
| `jsonwebtoken` + `@types/jsonwebtoken` | Only `package.json` matches in audit |
| `node-sarif-builder` | Only `package.json` |
| `wrangler` | Only `package.json`; no `wrangler.toml` / `wrangler.json` in repo (per glob) |

**Ambiguous direct dependencies**

- `import-in-the-middle`, `require-in-the-middle` — no matches in `src`/`tests`; may be transitive/runtime for observability. Needs `pnpm why` / lockfile review.

---

## 2) Critical assessment

- Export-level dead code in `src/` **not systematically enumerated** without Knip + Next-aware config.
- Tests use **dynamic** `import()` — naive static counts false-flag live code.
- **Strongest signal:** declared deps with **no** TS/JS imports — still verify CI/scripts/lockfile before removal.
- Knip failure means this audit **cannot** replace unused-export scan.

---

## 3) Recommendations (confidence)

**High (if verified externally)**

- `jsonwebtoken` + `@types/jsonwebtoken` — confirm no undocumented scripts.
- `node-sarif-builder` — confirm no SARIF generation pipeline.
- `wrangler` — likely unused if no config and no references.

**Medium**

- `import-in-the-middle` / `require-in-the-middle` — verify with `pnpm why` before touching.

**Low**

- File/symbol-level unused exports under `src/` — **unverified** pending Knip or graph tool.

---

## 4) Summary

Knip did not run (`EPERM`). Manual spot checks show no obvious dead modules in sampled areas. **Clearest signal:** several deps never appear in TS/JS imports (`jsonwebtoken`, types, `node-sarif-builder`, `wrangler`). Hook-loader packages may still be **transitive-critical** — unverified. **Unused exports/files:** explicitly unverified.
