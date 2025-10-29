<!-- 46f0856c-0f01-4b47-b411-767252982602 b2965b3b-3a10-4aa6-95b2-125fe5435702 -->

# Phase 6: Tests Implementation Plan (Unit, Integration, E2E)

## Scope

- Implement all testing work in Phase 6 of `specs/006-curation-engine/tasks.md` (Step 14) using guidance from `plan.md` Testing section.
- No real network calls in tests; fully mocked and fixture-driven.

## Test strategy

- Framework: Vitest (already configured via `vitest.config.ts` and `tests/setup.ts`).
- Deterministic, fast tests: use fixtures; no sleeps; use fake timers for TTL/expiry logic.
- External APIs fully mocked (YouTube, Google CSE, HTTP HEAD). DB interactions use existing test DB helpers.
- Concurrency tests simulate parallel calls with `Promise.all` and instrumentation counters.

## Unit tests (add under `tests/unit/curation/` and `tests/unit/ai/`)

1. `tests/unit/curation/cache.spec.ts`

- getCachedResults/setCachedResults happy path; read-through write-back
- Stage-specific TTL selection (search, yt-stats, docs-head, negative)
- Negative cache suppression (miss cached briefly)
- LRU in-process hits avoid DB reads
- Cache version invalidation (`CURATION_CACHE_VERSION`)
- getOrSetWithLock dedupes concurrent fetches (single upstream call)
- Re-scoring persistence when cached results lack `score`

2. `tests/unit/curation/ranking.spec.ts`

- Component scoring: normalize to [0,1]; blended score stable
- `minScore` cutoff enforcement
- Diversity selection when scores close (doc + video)
- Early-stop fill when 3 high-scorers from first source

3. `tests/unit/curation/validate.spec.ts`

- Docs HEAD 200 accepted; 3xx followed to 200; 4xx/5xx rejected (mock fetch)
- YouTube availability: `privacyStatus!='private'` and `embeddable=true`
- URL canonicalization (strip common tracking params)

4. `tests/unit/curation/youtube.spec.ts`

- `search.list` params/fields shaping and maxResults handling
- `videos.list` batching + fields shaping
- Candidate mapping with statistics/metadata
- Availability filter + `minScore` cutoff

5. `tests/unit/curation/docs.spec.ts`

- CSE query shaping (`siteSearch` allowlist, `num=5`); fields parsed
- Heuristic fallback domains when CSE env is absent
- Validation + scoring integration, sorted candidates

6. `tests/unit/ai/pacing.spec.ts`

- Weeks calculation edge cases (start today, deadlines in past/future)
- Capacity derivation across skill levels
- Pruning keeps order and at least one task per module

## Integration tests (add under `tests/integration/`)

1. `tests/integration/db/resources.integration.spec.ts`

- Upsert `resources` by unique `url`; metadata set/reused
- Attach `task_resources` idempotently (no duplicates) and preserves order (1–3)

2. `tests/integration/workers/curation.integration.spec.ts`

- Worker job processes a plan and attaches 1–3 resources/task with `minScore` respected
- Source diversity when available (doc + video) while ordered by score
- Cache behavior across runs: second run performs fewer upstream calls
- Concurrency dedupe: two jobs with same `query_key` lead to one upstream fetch

3. `tests/integration/orchestrator/pacing.integration.spec.ts`

- Orchestrator applies pacing before persist; at least one task per module; stable IDs

## E2E tests (extend under `tests/e2e/`)

1. `tests/e2e/plan-generation-curation.spec.ts`

- 5h/week with 4-week deadline generates scoped plan
- Each task shows ≥1 resource; none below cutoff; micro-explanations appended
- Links "valid" at app layer (based on validate module), not live network

2. `tests/e2e/plan-generation-cache.spec.ts`

- Re-run scenario shows reduced external call counters and preserved attachments

## Mocks, fixtures, helpers

- Add `tests/fixtures/curation/` with static JSON: `youtube-search.json`, `youtube-videos.json`, `cse-search.json`, `docs-heads.json`.
- Extend `tests/helpers/`:
  - `http.ts`: mock `fetch`/HEAD with per-URL responses and latency-free resolutions
  - `locks.ts`: simulate advisory lock behavior for `getOrSetWithLock`
  - Instrumentation counters to assert “upstream calls” count
- Use `vi.mock` for curation adapters boundary in unit tests; in integration, mock only external HTTP; allow DB real.

## Env & configuration in tests

- Force `ENABLE_CURATION=true`, set `MIN_RESOURCE_SCORE=0.6` (override-able in specific tests)
- Provide fake `YOUTUBE_API_KEY`, optional `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY` to drive CSE-on/CSE-off branches
- Use `vi.useFakeTimers()` to test TTL expiry quickly

## Documentation updates

- Update `docs/testing/testing.md` with new suites, mocking policy (no live network), and how to add new fixtures.

## Risks and mitigations

- Flakiness due to time: rely on fake timers and fixtures.
- E2E speed: use minimal flow; skip heavy UI rendering when API route suffices.

## To-dos

- [x] Add cache unit tests for TTLs, negative cache, LRU, versioning, dedupe
- [x] Add ranking unit tests for scoring, cutoff, diversity, early-stop
- [x] Add validate unit tests for HEAD logic, YouTube status, URL cleanup
- [x] Add YouTube adapter unit tests for params, mapping, cutoff, availability
- [x] Add docs adapter unit tests for CSE shaping, fallback, scoring, validation
- [x] Add pacing unit tests for weeks, capacity, pruning per module
- [x] Add DB integration tests for resources upsert and task_resources attachments
- [x] Add worker integration tests for attachments, diversity, cache, dedupe
- [x] Add orchestrator integration tests for pacing before persist
- [x] Add E2E test to assert resources, explanations, cutoff respected
- [x] Add E2E test for cache causing reduced external calls on rerun
- [x] Add fixtures and test helpers for HTTP mocks and locks
- [x] Update docs/testing/testing.md with suites and mocking policy
