# Phase 3: Docs, Observability, and Workflow Polish — Research

> **Parent PRD:** `prds/local-high-fidelity-mocks/prd.md`
> **Research date:** 2026-03-30
> **Scope:** Make the local product-testing system understandable and repeatable

---

## Current State

The repo already has useful pieces, but they are fragmented:

- local DB bootstrap commands exist;
- AI and AV already log meaningful provider/failure details;
- `docs/development/commands.md` already warns that `DEV_AUTH_USER_ID` requires an existing DB user;
- `.env.example` has local-service flags, but there is no one place that explains the full local product-testing workflow;
- some architecture/docs material is stale and points at old paths.

That means Phase 3 is not about inventing the workflow. It is about consolidating and polishing the one built in Phases 1 and 2.

## Recommended Direction

- Update `.env.example` and development docs so the local path is explicit.
- Add one smoke-test workflow for the main product surfaces.
- Make active local mode and active local scenarios visible through logs and, where appropriate, light UI diagnostics.
- Call out non-parity areas directly so local mode is trusted for the right things and not over-trusted.

## Files Likely To Change

- `.env.example`
- `docs/development/environment.md`
- `docs/development/local-database.md`
- `docs/development/commands.md`
- `docs/architecture/av-scanner-pdf-uploads.md`
- Any small UI/debug affordance introduced by earlier phases

## Implementation Steps

1. Consolidate env/bootstrap docs around local product-testing mode.
2. Write a manual smoke workflow covering seeded-user selection, billing, integrations, AI, and PDF upload.
3. Add observability guidance so developers can tell which mock paths were active.
4. Fix stale docs and path references discovered during research.

## Risks

- If docs land too late or stay vague, the feature will work only for whoever built it.
- If active mock state is invisible, debugging local failures will remain slower than it should be.
- If non-parity areas are not documented clearly, local confidence will become misplaced confidence.

## Manual Workflow Checklist

1. Start local DB and bootstrap seeded data.
2. Start the app in local product-testing mode.
3. Select a seeded local user.
4. Verify protected product pages load.
5. Verify local pricing, checkout, portal, and subscription updates.
6. Verify integration connected/disconnected behavior.
7. Verify AI success and failure scenarios.
8. Verify PDF clean, infected, timeout, and malformed-provider scenarios.
9. Note which remaining flows still require staging.
