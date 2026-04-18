# Track 4: circular-deps

## (1) Cycles found — none detected (with evidence)

**Primary check (from repo root):**

```bash
pnpm dlx madge --circular --extensions ts,tsx src
```

- Result: **No circular dependency found**
- Caveat: **352 warnings** — mostly **unresolved `@/…`** because madge was not using TS path mapping.

**Stronger check (paths resolved):**

```bash
pnpm dlx madge --circular --extensions ts,tsx --ts-config tsconfig.json src
```

- Result: **No circular dependency found**
- Processed: **501 files**, **8 warnings** (skipped modules): `@neondatabase/auth/*` subsets, `pdf-parse/worker`, `tailwindcss`, `tw-animate-css`

---

## (2) Critical assessment

| Factor | Implication |
|--------|-------------|
| Tooling | Madge = **static** import graph; not runtime cycles or logical layering violations. |
| Path aliases | Without `--ts-config`, results **misleading** (many `@/` edges dropped). **Always pass `tsconfig.json`.** |
| Skipped modules | Externals; low risk if only types/re-exports. |
| Codebase | `src/shared/types/client.ts` documents separation to avoid server↔client cycles. |
| Tests | Comment in `tests/unit/ai/providers/mock.spec.ts` about avoiding circular deps in tests — isolation choice. |

**Bottom line:** Static cycles in `src`: **none detected** with resolved aliases.

---

## (3) Break-cycle proposals

No cycles found — **preventive** only:

| Priority | Proposal |
|----------|----------|
| **High** | Run madge **with** `--ts-config tsconfig.json` (or document in CI). |
| **Medium** | Keep layer boundaries (`shared/types` vs UI vs `lib/db`). |
| **Low** | Optional ESLint `import/no-cycle` — can be noisy. |

If a cycle appears later: extract **types + pure helpers** to a leaf module (high impact); DI or dynamic `import()` at boundary (medium); barrel cleanup (low).

---

## (4) Summary

**Madge: no circular dependencies** in `src` for 501 TS/TSX files with **`--ts-config tsconfig.json`**. First run without tsconfig **not trustworthy**. Eight externals skipped. **No break-fix required today**; highest follow-up is **tsconfig-aware** graph checks in CI or docs.
