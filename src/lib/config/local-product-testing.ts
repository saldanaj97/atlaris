/**
 * Local product-testing mode — explicit contract for development and automated tests only.
 *
 * **Not** hosted auth/session parity: staging remains the source of truth for real Neon Auth
 * and OAuth. This mode coordinates seeded DB users with `DEV_AUTH_USER_ID` as a local
 * identity selector (see PRD `.plans/local-high-fidelity-mocks/prd.md`).
 *
 * ## Config precedence (how this relates to other env vars)
 *
 * - **`LOCAL_PRODUCT_TESTING`** — Master switch for “I am using the local product-testing
 *   workflow” (bootstrap + seeded user + docs). Refused at process startup in production.
 *   It does **not** replace per-feature flags; those keep their meaning:
 * - **`DEV_AUTH_USER_ID` / `DEV_AUTH_USER_*`** — Select which seeded `users.auth_user_id`
 *   row the server treats as the effective user in development/test (when set). Must match
 *   an existing user row; use {@link LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID} with bootstrap.
 * - **`AI_USE_MOCK` / `AI_PROVIDER`** — AI runtime behavior (unchanged).
 * - **`AV_PROVIDER`** — `none` = heuristic-only; mock AV is a separate provider in Phase 2.
 * - **`STRIPE_*` / billing env** — Local billing uses additional flags in Phase 1 billing slice.
 *
 * Prefer reading feature behavior from the grouped configs in `@/lib/config/env` rather than
 * `process.env` directly.
 */

/** Seeded `users.id` (deterministic UUID) created by `pnpm db:dev:bootstrap`. */
export const LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID =
  '11111111-1111-4111-8111-111111111111' as const;

/**
 * Seeded `users.auth_user_id`. Set `DEV_AUTH_USER_ID` to this value so server-side local
 * identity resolves to the bootstrap user row.
 */
export const LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID =
  '00000000-0000-4000-8000-000000000001' as const;

export const LOCAL_PRODUCT_TESTING_SEED_EMAIL =
  'local-product-test@localhost.local' as const;

export const LOCAL_PRODUCT_TESTING_SEED_NAME = 'Local Product Test' as const;
