# Phase 7 Manual Testing Checklist

Use this checklist to validate the background job system end-to-end before shipping. Run through the list in order; all steps should pass without console errors.

## Environment Prep

- [ ] Start the application server: `pnpm dev`
- [ ] Start the worker in a separate terminal: `pnpm dev:worker`
- [ ] Ensure `MOCK_GENERATION_FAILURE_RATE=0` for the happy-path run (default in `.env.local.sample`)
- [ ] Seed a demo user if needed: `pnpm seed`

## Happy Path Flow

- [ ] Complete the onboarding form with realistic inputs and submit
- [ ] Confirm redirect to the plan detail view with a `pending` status banner
- [ ] Watch worker logs for `job_started` followed by `job_completed`
- [ ] Wait for the automatic UI refresh to switch status to `ready`
- [ ] Verify generated modules and tasks render without console warnings

## Failure + Retry Validation

- [ ] Stop the worker mid-run (`Ctrl+C`) while a job is `processing`
- [ ] Restart the worker; confirm the same job resumes and finishes successfully
- [ ] Set `MOCK_GENERATION_FAILURE_RATE=0.5`, restart worker, submit another plan
- [ ] Observe at least one `job_failed` log followed by a retry and eventual success
- [ ] Confirm the plan detail view surfaces transient errors before recovery (toast or banner)

## Rate Limiting & Guardrails

- [ ] Rapidly submit 10+ plans for the same user (use browser or REST client)
- [ ] Confirm the API responds with the configured rate-limit error after the allowed burst
- [ ] Inspect `/api/v1/plans/{id}/status` for a rate-limited plan; the latest job should remain `pending`

## Observability Spot Checks

- [ ] Hit `/api/health/worker` and confirm status reports `ok`
- [ ] Verify monitoring queries or dashboards (if enabled) reflect queue depth and recent attempts

Mark each item `[x]` when the behavior matches expectations. Capture screenshots/logs for any anomalies and open an issue before release.
