# Production TypeScript Rules (2025)

These rules are written so a junior engineer can follow them without guessing. If a rule is unclear, fix the rule (not the code).

---

## 0) Non-Negotiable Principles

- TypeScript improves correctness, but it does **not** replace runtime validation.
- Types should **reduce** future change cost, not increase it (no clever types that nobody can maintain).
- Code should be safe by default: strict compiler, strict lint, and safe boundaries.

---

## 1) Compiler Rules (tsconfig)

### Required

- `"strict": true`
- `"noImplicitReturns": true`
- `"noFallthroughCasesInSwitch": true`
- `"useUnknownInCatchVariables": true`
- `"noImplicitOverride": true`

### Strongly Recommended (turn on unless you have a real reason)

- `"exactOptionalPropertyTypes": true`
- `"noUncheckedIndexedAccess": true`
- `"noPropertyAccessFromIndexSignature": true`
- `"forceConsistentCasingInFileNames": true`

### Module/Import sanity (pick what matches your runtime)

- Do not mix ESM/CJS rules casually.
- If your build uses modern ESM/bundlers, enable:
  - `"verbatimModuleSyntax": true` (prevents type/value import confusion)
- If you don’t understand your module config, you are not allowed to “just make it work” with random `require()` or `esModuleInterop` hacks.

---

## 2) Linting / Formatting Rules

### Required ESLint behaviors

- No floating promises (unhandled async work).
- No unsafe `any` propagation.
- Enforce `import type` for type-only imports.
- Prefer `const` and no unused vars/imports.

### Required formatting

- Prettier (or equivalent) is enforced.
- No “formatting debates” in PRs.

---

## 3) File + Import Rules

### Type-only file rules (Hard Rules)

Use these exactly.

- Files named `*.types.ts`:
  - MUST NOT export runtime values
  - MUST NOT contain executable code
  - SHOULD be imported using `import type`
- Runtime code MUST NOT import values from `*.types.ts`
- If a file contains only types and is erased at compile time, it MUST be named `*.types.ts`
- Enforce with ESLint:
  - Disallow value exports in `*.types.ts`
  - Disallow value imports from `*.types.ts`

### Naming standard

- Default: `<feature>.types.ts` (e.g. `user.types.ts`)
- Folder-scoped alternative (only if folder is clearly scoped): `types.ts`
- Disallowed: `interfaces.ts`, `models.ts`, `types.d.ts` (unless ambient), `index.ts` as “types-only”.

### Import rules

- Always use `import type { X } from "..."` when you only need types.
- Do not rely on “it compiles” to justify messy imports—clean boundaries prevent circular deps and runtime surprises.

---

## 4) Type Safety Rules (Daily Coding)

### Never allow these in production PRs

- `any` (except a documented containment zone; see below)
- `as any`, `as unknown as T` (double assertion)
- Non-null assertions: `value!` (fix the flow, don’t silence it)
- `// @ts-ignore` (use `@ts-expect-error` with a comment, and treat it as tech debt)

### If you must use `any`

- Isolate it in one file/function, document why, and immediately convert back to safe types at the boundary:
  - Use `unknown` + runtime parsing/validation
  - Or a narrow type guard

### Prefer `unknown` over `any`

- Any external input is `unknown` until validated:
  - API responses
  - user input
  - env vars
  - localStorage/session data
  - webhook payloads

---

## 5) Runtime Validation at Boundaries

Types do not validate data at runtime.

### Required boundary pattern

- Parse/validate at the edge.
- Inside your app, use trusted typed objects.

Examples of boundaries:

- `fetch()` / axios responses
- Next.js route handlers
- webhooks
- reading `process.env.*`

If you don’t validate, you are lying to the type system.

---

## 6) Modeling Rules (How to design types)

### Use unions + discriminants for state machines

- Prefer:
  - `type State = { kind: "loading" } | { kind: "ready"; data: X } | { kind: "error"; error: E }`
- Avoid “bags of optionals”:
  - `type State = { loading?: boolean; data?: X; error?: E }` (this creates impossible states)

### Exhaustiveness is mandatory

When switching on a discriminant:

- Add an exhaustive check:
  - `default: return assertNever(x);`
  - `function assertNever(x: never): never { throw new Error("Unexpected"); }`

### `interface` vs `type`

- Use `type` by default.
- Use `interface` only when you explicitly want extension/merging (library-like patterns).
- Do not mix randomly.

### Avoid `enum`

- Prefer string unions:
  - `type Role = "admin" | "user"`
- Or `const` objects + `as const`:
  - `const Role = { Admin: "admin", User: "user" } as const; type Role = typeof Role[keyof typeof Role];`

### Prefer `satisfies` for config objects

- Use `satisfies` to validate shapes without widening:
  - `const cfg = { ... } satisfies SomeType`

---

## 7) Functions + APIs

### Exported functions must be explicit

- All exported functions must have explicit parameter and return types.
- Do not export “inferred mystery meat” from public modules.

### Never accept “wide” inputs without narrowing

- If a function accepts user input or external data, take `unknown` and validate, or require a validated type.

### Avoid boolean parameters

- Prefer an options object:
  - Bad: `doThing(data, true)`
  - Good: `doThing(data, { dryRun: true })`

---

## 8) Error Handling Rules

- Never throw strings.
- Always preserve the original error as `cause` when wrapping.
- Prefer typed error results at boundaries where failures are expected (parsing, IO, external APIs).
- Do not use exceptions for normal control flow.

---

## 9) Async / Promise Rules

- No floating promises.
- Always handle cancellation where relevant (use `AbortSignal` or equivalent).
- Don’t `await` inside loops by accident; be intentional:
  - sequential vs parallel should be explicit.
- `Promise.all` must have a failure strategy (what happens if one fails?).

---

## 10) Readability + Maintainability Rules

- No “clever” generics unless it removes real duplication and stays readable.
- Avoid deeply recursive conditional types unless the benefit is obvious and documented.
- Types must be named for the domain (not the implementation).
- Keep types close to what they model (DTO types near API layer; domain types near domain).

---

## 11) PR Checklist (Required)

Before requesting review, verify:

- [ ] tsconfig strictness is not bypassed
- [ ] No new `any` without containment + explanation
- [ ] External data is validated at boundaries
- [ ] Discriminated unions are used for state; no impossible states
- [ ] Switch statements are exhaustive
- [ ] All exported functions have explicit types
- [ ] `*.types.ts` files contain types only and use `import type`
- [ ] No `!` non-null assertions and no `ts-ignore`
- [ ] Async work is awaited or intentionally handled
- [ ] Code is readable by someone new to the codebase
