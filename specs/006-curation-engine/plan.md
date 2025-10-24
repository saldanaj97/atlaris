<!-- 9fe2f62a-a639-4710-8f4c-fec752316ffd d8bd16f4-0265-44de-9c83-425d110dacd2 -->

# Implement Curation Engine, Pacing, and Micro‑Explanations (MVP)

### Scope and decisions

- **Sources**: YouTube + official docs only (no MOOCs).
- **Micro‑explanations**: Persist inline in `tasks.description` (no schema change). Keep concise (2–3 sentences) with optional exercises.
- **Performance**: Staged retrieval + caching. Fetch minimal metadata, rank top K, attach 1–3 per task. Prefer source diversity (doc + video) when available, but always choose top‑scoring resources. Avoid GraphQL—use REST with selective fields and server‑side caching.

### High‑level design

- **Pipeline (single worker job, staged)**

1. AI plan generation (existing).
2. Apply pacing (cap modules/tasks by capacity computed from weeklyHours + deadline).
3. Curation for each task (bounded concurrency):

- Query YouTube search API → get video IDs (minimal fields) → batch `videos.list` for `statistics` (+ `status`) → rank with score cutoff → validate → upsert into `resources` → attach top 1–3 via `task_resources`.
- Query Docs via programmable search (optional) or curated domain heuristics per topic → rank with score cutoff → validate (HEAD) → upsert/attach.

4. Generate micro‑explanations per task via AI SDK `streamObject` with Zod schema → append to `tasks.description`.
5. Save and mark job complete.

- **Caching**
- Add `resource_search_cache` table (query_key, source, params_hash, results JSON, expires_at). TTL ~7 days. Cache keys derived from `topic|task_title|filters`.
- Deduplicate resources by `resources.url` (unique). Reuse existing rows.
- Tiered cache: add a small in‑process LRU (e.g., 500 keys) in the worker for same‑run lookups, backed by the Postgres JSONB TTL cache across runs.
- Stage‑specific TTLs: YouTube search results ~7d; YouTube `videos.list` stats/availability ~2d; docs HEAD validation ~5d; negative cache (empty/failed searches) ~4h.
- Negative caching: store known misses/empties briefly to avoid repeated upstream calls.
- Early‑stop fill: stop searching once 1–3 items ≥ `minScore` are assembled; prefer diversity if available, but do not force additional external calls when already filled with strong results.
- Cache versioning: include a `cache_version`/`score_config_version` in the cache key so changes to scoring/filters invalidate cleanly.
- Concurrency dedupe: guard `getOrSet` with an advisory lock or `SELECT … FOR UPDATE SKIP LOCKED` to ensure only one upstream fetch per `query_key` under contention.
- Cleanup: periodic job (daily) to delete expired rows; can run inside the worker loop.

- **Scoring cutoff & selection**
- Enforce a minimum quality score (`minScore`) to filter low‑quality resources.
- Attach 1–3 resources per task. If more than 3 pass the cutoff, pick the top 3 by blended score. Prefer source diversity when available (e.g., 1 doc + 1–2 videos), while still honoring top scores.
- When cached results lack `score`, recompute locally, then persist `score` and `scoredAt` into cached `results` to avoid recomputation later.
- **Why not GraphQL now**
- YouTube is REST; most docs lack GraphQL. The cost issue is addressed better by staged fetch, selective fields, TTL cache, and bounded concurrency. We can wrap our internal reads with GraphQL later if needed, but it doesn’t reduce external API cost.

### Data model (minimal)

- Keep `resources` and `task_resources` as‑is.
- New: `src/lib/db/migrations/*` create `resource_search_cache` with:
- `id uuid pk`, `query_key text unique`, `source text`, `params jsonb`, `results jsonb`, `created_at timestamptz default now()`, `expires_at timestamptz`, indexes on `(query_key)`, `(source, expires_at)`.

Note: Resource scores are computed at runtime and may be cached in `results` JSON (including `score`, `scoredAt`, and availability flags) to avoid recomputation. Persistent scoring fields are not required for MVP.

### Modules to add

- `src/lib/curation/types.ts`: `ResourceCandidate`, `CurationParams`, `CurationResult`, `Score`.
- `src/lib/curation/youtube.ts`: `searchYouTube(query, opts)`, `getVideoStats(ids)`, `scoreYouTube(candidate)` using views/recency/channel.
- `src/lib/curation/docs.ts`: official docs fetcher. Prefer Google Programmable Search (env‑gated) with domain allowlist; fallback heuristics map (e.g., react.dev, typescriptlang.org, developer.mozilla.org).
- `src/lib/curation/ranking.ts`: normalize + blend scores across sources, enforce `minScore` cutoff, prefer source diversity when attaching top 1–3, and support early‑stop fill when enough high‑scorers collected.
- `src/lib/curation/cache.ts`: in‑memory LRU + Postgres TTL cache; `getCachedResults`, `setCachedResults`, `getOrSetWithLock` (advisory lock or SKIP LOCKED), negative caching support, stage‑specific TTLs, `cache_version` handling, and `hashKey(normalize(query)+source+paramsVersion+cache_version)`.
- `src/lib/curation/validate.ts`: link health checks (docs: HTTP HEAD 200), YouTube availability (embeddable, not private), and basic URL validation.
- `src/lib/db/queries/resources.ts`: upsert `resources` and attach via `task_resources` with stable ordering.
- `src/lib/ai/pacing.ts`: capacity calculator and trimming helpers.

### Integration points

- `src/lib/ai/prompts.ts`: add system/user prompt hints to request micro‑explanations + exercise suggestions.
- `src/lib/ai/orchestrator.ts`:
- Before persisting: compute pacing capacity and trim modules/tasks accordingly.
- Optionally pass pacing context in prompt variables.
- `src/lib/jobs/worker-service.ts` (in `processPlanGenerationJob`): after AI success and before final success:
- Run curation attach (p‑limit concurrency, retry light) with `minScore` cutoff and validation. Use in‑memory LRU to avoid repeated DB lookups inside the job.
- Run micro‑explanation generation and append to `tasks.description`.
- Consider time budget; if nearing limit, attach at least 1 resource per task and defer extras.
- Apply early‑stop fill: only fetch a second source if fewer than 3 high‑scoring resources are found or if cached results are available for diversity at low cost.
- Use concurrency dedupe via advisory locks/SKIP LOCKED when multiple jobs attempt the same `query_key`.
- Trigger periodic cleanup for expired cache rows.

### API usage details (cost‑aware)

- **YouTube**
- `search.list`: `part=snippet`, `type=video`, `maxResults=10`, filters: `videoDefinition=high`, `videoDuration` by learning style if applicable; use `fields=items(id/videoId,snippet/title,snippet/channelTitle)`.
- `videos.list`: `part=statistics,snippet,contentDetails,status`, `id=<comma ids>`, `fields=items(id,statistics(viewCount,likeCount),snippet(publishedAt,channelTitle),contentDetails(duration),status(privacyStatus,embeddable,license))`.
- Rank by: log(viewCount), recency decay, channel match, duration suitability; discard below `minScore`; validate availability (embeddable, not private).
- Batch `videos.list` IDs (up to API limits) to reduce request count; `fields` reduces payload size (latency), not quota cost.
- **Docs**
- If `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY` set: call Programmable Search with `siteSearch` limited to allowlist for topic; `num=5`; rank by snippet relevance + domain authority.
- Else heuristic map: topic keywords → canonical docs landing pages.
- Validate link health with HTTP HEAD and discard non‑200 responses; apply `minScore` cutoff after ranking.
- Skip docs search when already filled with 1–3 high‑scoring resources unless cheap cached docs are available to add diversity.

### Pacing logic

- Compute `weeks = ceil((deadlineDate - (startDate||today))/7d)`; `hours = weeklyHours` (numeric from mapper).
- `avgTaskMinutes`: 45 (adjust by skill level: beginner +10, advanced −10).
- `capacityTasks = floor((hours * weeks * 60) / avgTaskMinutes)`; prune tasks across modules, preserving order; keep at least 1 per module.

### Env/config

- `YOUTUBE_API_KEY` required.
- Optional: `GOOGLE_CSE_ID`, `GOOGLE_CSE_KEY` for docs search.
- Bounded concurrency via `p-limit` (e.g., 3–5). Backoff with `p-retry`.
- `MIN_RESOURCE_SCORE` optional env to override default cutoff (e.g., default `0.6`).
- `CURATION_CACHE_VERSION` to invalidate cached results when scoring/filters change.
- TTL overrides (optional): `CURATION_CACHE_TTL_SEARCH_DAYS` (default 7), `CURATION_CACHE_TTL_YT_STATS_DAYS` (default 2), `CURATION_CACHE_TTL_DOCS_HEAD_DAYS` (default 5), `CURATION_NEGATIVE_CACHE_TTL_HOURS` (default 4).
- LRU size override: `CURATION_LRU_SIZE` (default 500 keys).

### Testing

- Unit: pacing calculator; ranking functions; cache get/set; YouTube adapter param shaping; `minScore` cutoff enforcement; link validation (docs HEAD 200, YouTube embeddable/not private);
  - Cache behavior: LRU hits avoid DB lookups; negative cache suppresses repeated misses; per‑stage TTLs respected; cache version change triggers misses.
  - Concurrency dedupe: `getOrSetWithLock` prevents duplicate upstream calls under contention (simulate parallel calls).
  - Early‑stop fill: when 3 high‑scoring items exist from the first source, skip fetching the second source unless cached results are available.
  - Re‑scoring: when cached results lack `score`, recompute and persist `score`/`scoredAt` into cached payload.
- Integration: worker processes a job → validates + filters resources by `minScore`; attaches 1–3 resources/task with source diversity when available; trims to capacity; micro‑explanations appended.
  - Integration cache: stage‑specific TTLs and negative cache reduce external calls across runs; dedupe prevents duplicate fetches across overlapping jobs.
- E2E: plan generation shows resources and micro‑explanations; case: 5h/week, 4 weeks results in scoped plan; at least one resource per task; no broken links; when both sources available, tasks include resources from multiple sources; no low‑quality resources below cutoff.

### Rollout

- Feature flag curation via env `ENABLE_CURATION` (default on in dev/test).
- Migrate DB; set envs; run `pnpm type-check` and relevant tests; verify rate limits.

### Integration steps

1. Prep and configuration
   - Add/verify env vars: `YOUTUBE_API_KEY`, optional `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY`, `ENABLE_CURATION`, `MIN_RESOURCE_SCORE` (default 0.6), `CURATION_CACHE_VERSION`, TTL overrides (`CURATION_CACHE_TTL_SEARCH_DAYS`=7, `CURATION_CACHE_TTL_YT_STATS_DAYS`=2, `CURATION_CACHE_TTL_DOCS_HEAD_DAYS`=5, `CURATION_NEGATIVE_CACHE_TTL_HOURS`=4), and `CURATION_LRU_SIZE` (500).
   - Decide default `minScore` and scoring weights; bump `CURATION_CACHE_VERSION` when changing them.
   - Ensure onboarding provides `weeklyHours` (numeric mapping) and `deadlineDate`.

2. Database migration: cache table
   - Create `resource_search_cache` with columns: `id uuid pk`, `query_key text unique`, `source text`, `params jsonb`, `results jsonb`, `created_at timestamptz default now()`, `expires_at timestamptz`.
   - Indexes: unique(`query_key`); `(source, expires_at)` for cleanup queries.
   - Apply migration locally and in test env; confirm read/write via drizzle client.

3. Types and shared interfaces
   - Add `src/lib/curation/types.ts` with `ResourceCandidate` (url, title, source, score, metadata), `Score` (components + blended), `CurationParams`, `CurationResult`.
   - Standardize resource `source` values: `youtube`, `doc`.
   - Ensure `resource_type` mapping aligns with DB enums.

4. Cache module
   - Implement `src/lib/curation/cache.ts`:
     - Normalize and hash keys: `hashKey(normalize(query)+source+paramsVersion+CURATION_CACHE_VERSION)`.
     - Stage-specific TTL selectors (search, yt-stats, docs-head, negative).
     - In-process LRU (size from env) checked first; falls back to DB cache.
     - `getCachedResults`/`setCachedResults` for JSON payloads including `score`, `scoredAt`, and availability flags when present.
     - Negative caching for empty/failed searches with short TTL.
     - `getOrSetWithLock`: use Postgres advisory locks or `FOR UPDATE SKIP LOCKED` to dedupe concurrent fetches.
     - Cleanup helper to delete expired rows.

5. Validation module
   - Implement `src/lib/curation/validate.ts`:
     - Docs: HTTP HEAD request with timeout; accept 200; treat 3xx as valid only if final target resolves; drop 4xx/5xx.
     - YouTube: from `videos.list` `status` verify `privacyStatus!='private'` and `embeddable=true`.
     - Basic URL validation and canonicalization (strip tracking params where safe).

6. Ranking module
   - Implement `src/lib/curation/ranking.ts`:
     - Compute per-source scores: YouTube (log(viewCount), recency decay, channel/title relevance, duration suitability); Docs (domain authority heuristic, snippet relevance).
     - Normalize all components to [0,1], blend with weights; produce `score` and components.
     - Enforce `minScore` cutoff; drop below-threshold candidates.
     - Selection: attach 1–3 by top blended score; prefer source diversity when available (at least one doc + one video) while respecting order by score.
     - Early-stop fill: once 3 high-scorers found from the first source, skip remaining external calls unless cheap cached results are available for diversity.

7. YouTube adapter
   - Implement `src/lib/curation/youtube.ts`:
     - `searchYouTube(query, opts)`: call `search.list` (`part=snippet`, `type=video`, `maxResults=10`, `videoDefinition=high`, optional `videoDuration`), with `fields` projection; cache results with search TTL and negative cache.
     - `getVideoStats(ids)`: batch `videos.list` (`part=statistics,snippet,contentDetails,status`) with `fields` projection; cache stats with yt-stats TTL.
     - Map to `ResourceCandidate`; score via ranking module; apply `minScore`; validate availability flags; return sorted candidates.

8. Docs adapter
   - Implement `src/lib/curation/docs.ts`:
     - If CSE env set: call Programmable Search limited to allowlist domains; cache results with search TTL and negative cache.
     - Else: heuristic map from topic keywords to canonical docs landing pages.
     - Validate with HTTP HEAD; score via ranking module; apply `minScore`; return sorted candidates.

9. DB queries for resources
   - Implement `src/lib/db/queries/resources.ts`:
     - Upsert into `resources` keyed by unique `url`; set `type`, `title`, and source metadata; reuse existing when deduped.
     - Attach to tasks via `task_resources` with stable ordering and idempotency (avoid duplicates); use transaction to attach 1–3 per task in order.

10. Pacing module

- Implement `src/lib/ai/pacing.ts`:
  - Compute `weeks` from `startDate||today` to `deadlineDate`; compute `avgTaskMinutes` (45 ± skill adjustment).
  - Derive `capacityTasks = floor((weeklyHours * weeks * 60) / avgTaskMinutes)`.
  - Prune tasks across modules in order; ensure at least one per module; maintain relative ordering and stable IDs.

11. Orchestrator integration

- In `src/lib/ai/orchestrator.ts`:
  - Apply pacing before persisting plan; pass pacing context to prompts when useful.
  - Ensure input mapping from frontend `OnboardingForm` yields numeric `weeklyHours` and a valid `deadlineDate`.

12. Worker integration

- In `src/lib/jobs/worker-service.ts` within `processPlanGenerationJob`:
  - Gate with `ENABLE_CURATION`.
  - For each task (bounded by p-limit):
    1.  Try reading cached candidates (YouTube first). If not enough above `minScore`, call adapter(s) with `getOrSetWithLock` to dedupe.
    2.  Apply ranking with `minScore`, validation, early-stop fill, and diversity preference.
    3.  Upsert resources and attach top 1–3 to the task in a transaction.
  - Generate micro‑explanations via Vercel AI SDK (`streamObject` + Zod), append to `tasks.description`.
  - Respect a time budget; if nearing limit, ensure at least one resource per task and defer extras.
  - Periodically run cache cleanup for expired rows.

13. Prompts

- Update `src/lib/ai/prompts.ts` to request concise micro‑explanations (2–3 sentences) and a short practice exercise when applicable; keep outputs markdown-safe and concise.
- Consider `streamObject` and `elementStream` for structured streaming if needed.

14. Testing

- Unit tests: pacing calculator; ranking functions; cache get/set; YouTube param shaping; cutoff enforcement; link validation; LRU hits; negative cache; TTLs; cache version invalidation; `getOrSetWithLock`; early‑stop fill; re-scoring cached items.
- Integration tests: worker end-to-end curation and attachments with diversity preference and cutoff; reduced external calls across runs due to cache; dedupe under contention; micro‑explanations appended.
- E2E: user 5h/week with 4-week deadline receives scoped plan; each task has ≥1 resource; links valid; multiple sources when available; no items below cutoff.

15. Rollout and ops

- Enable in dev/test; verify rate limits and cost; monitor logs for cache hit rate, external call count, and failure modes.
- Set production env vars; enable feature flag progressively; have a fallback: if keys missing or rate-limited, attach cached/heuristic docs only.

### Recommended Integration Path

- [ ] Phase 1 (blocking foundations)
  - [ ] Step 1: Prep and configuration
  - [ ] Step 2: Database migration: cache table
  - [ ] Step 3: Types and shared interfaces
- [ ] Phase 2 (blocking curation core)
  - [ ] Step 4: Cache module (LRU, TTLs, negative cache, getOrSetWithLock)
  - [ ] Step 5: Validation module (HEAD checks, YouTube status)
  - [ ] Step 6: Ranking module (scoring, cutoff, diversity, early-stop)
- [ ] Phase 3 (blocking sources + persistence)
  - [ ] Step 7: YouTube adapter
  - [ ] Step 8: Docs adapter
  - [ ] Step 9: DB queries for resource upsert/attachments
- [ ] Phase 4 (blocking pacing + orchestration)
  - [ ] Step 10: Pacing module
  - [ ] Step 11: Orchestrator integration
- [ ] Phase 5 (worker + prompts)
  - [ ] Step 12: Worker integration (curation attach, time budget, cleanup)
  - [ ] Step 13: Prompts for micro‑explanations/exercises
- [ ] Phase 6 (tests)
  - [ ] Step 14: Unit, integration, and E2E tests
- [ ] Phase 7 (rollout)
  - [ ] Step 15: Rollout and ops

#### Safe overlaps

- Step 9 (DB upsert/attachments) can proceed in parallel with Steps 7–8 (YouTube/Docs adapters).
- Step 10 (Pacing module) can start during Phase 3; Step 11 (Orchestrator) waits on Step 10.
- Step 14 (Tests) can begin incrementally as modules land:
  - Unit tests after Steps 4–8 (cache, validation, ranking, adapters).
  - Integration tests after Step 12 (worker integration) is available.
  - E2E after Step 11 (orchestrator) stabilizes.
- Optional: Step 3 (types/interfaces) can iterate alongside Step 2 once cache table shape is finalized.

### To-dos

- [ ] Add resource_search_cache table via drizzle migration
- [ ] Create curation types under src/lib/curation/types.ts
- [ ] Implement YouTube search+stats adapter with scoring and validation
- [ ] Implement docs adapter: CSE (env-gated) with heuristics fallback + HEAD validation
- [ ] Implement cache get/set for curation results with stage‑specific TTLs, negative caching, in‑process LRU, `cache_version`, and `getOrSetWithLock`
- [ ] Add queries to upsert resources and attach to tasks
- [ ] Blend and rank candidates across sources with `minScore` cutoff, source diversity preference, and early‑stop fill
- [ ] Add pacing calculator and task trimming helpers
- [ ] Update prompts to request micro‑explanations/exercises
- [ ] Integrate pacing into orchestrator before persisting
- [ ] Run curation+attachments (1–3 per task) and micro‑explanations in job service; apply concurrency dedupe and in‑job LRU
- [ ] Add periodic cleanup for expired cache rows
- [ ] Add unit tests for pacing, ranking, cache, adapters, cutoff enforcement, and link validation
- [ ] Add unit tests for cache TTLs, negative cache, early‑stop fill, cache versioning, and dedupe locking
- [ ] Add integration tests for worker curation+attachments with diversity preference and cutoff, reduced external calls via cache, and dedupe under contention
- [ ] Update E2E to assert resources (1–3), explanations, no broken links, and cutoff respected
