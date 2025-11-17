# API Docs & Observability

This document describes the minimal API documentation and observability baseline for the Atlaris API.

## OpenAPI documentation

- The OpenAPI document is generated from Zod schemas using `@asteasolutions/zod-to-openapi`.
- The generator lives in `src/lib/api/openapi/schema.ts` and currently covers three high-traffic routes:
  - `GET /api/v1/plans`
  - `POST /api/v1/plans`
  - `GET /api/v1/user/subscription`

### How to view the docs locally

- Start the dev server: `pnpm dev`
- Open the Scalar API reference UI at: `http://localhost:3000/api/docs`
  - The UI is powered by Scalar via a CDN script and reads the OpenAPI document from `GET /api/docs/openapi`.
- Both `/api/docs` and `/api/docs/openapi` are gated to **development and test**:
  - In production they return `404 Not Found`.

## Observability (Sentry baseline)

Sentry is wired as a minimal APM/logging baseline with **strict env gating**.

### Configuration

All configuration is centralized in `src/lib/config/env.ts` under `observabilityEnv`:

- `SENTRY_DSN` – DSN for the Sentry project (optional).
- `SENTRY_TRACES_SAMPLE_RATE` – trace sampling rate (default: `0.1`).
- `SENTRY_PROFILES_SAMPLE_RATE` – profiling sampling rate (default: `0.1`).

If `SENTRY_DSN` is **absent or empty**, Sentry initialization is skipped and has **no runtime impact**.

### Initialization

- Sentry is initialized lazily in `src/lib/observability/sentry.ts`.
- API route handlers call `initSentry()` from:
  - `withAuth` – initializes Sentry once per process (no-op if DSN is missing).
  - `withErrorBoundary` – ensures caught exceptions are sent to Sentry via `Sentry.captureException`.

### Behavior guarantees

- When `SENTRY_DSN` is **unset**:
  - No Sentry SDK initialization occurs.
  - API handlers behave exactly as before (no extra network calls or error handling changes).
- When `SENTRY_DSN` is **set**:
  - API requests are initialized with Sentry, enabling error reporting and basic tracing/profiling.
  - Unhandled errors in API routes are captured and correlated with existing structured logs.
