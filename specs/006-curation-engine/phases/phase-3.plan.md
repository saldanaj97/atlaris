<!-- dd81124a-19b1-41e2-86e3-a51a94721220 cfdf0626-d43e-41a7-8600-1455e71ce927 -->

# Phase 3 — Implement Sources and Persistence (Steps 7–9)

## Scope

- Implement YouTube adapter and Docs adapter that consume cache/validate/ranking from Phase 2.
- Add DB utilities to upsert `resources` and attach 1–3 per task in order, idempotently.
- Keep cost low: cache first, stage-specific TTLs, early-stop where applicable.

## Pre-reqs (assumed from Phase 2)

- `src/lib/curation/cache.ts` with: `buildCacheKey`, `getOrSetWithLock`, stage TTLs (`search`, `yt-stats`, `docs-head`, `negative`).
- `src/lib/curation/validate.ts` with: `headOk`, `canonicalizeUrl`, `isYouTubeEmbeddable`.
- `src/lib/curation/ranking.ts` with: `scoreYouTube`, `scoreDoc`, `selectTop`.
- Types and config present: `src/lib/curation/types.ts`, `src/lib/curation/config.ts`.

## Step 7: YouTube adapter — `src/lib/curation/youtube.ts`

- Exports:
  - `searchYouTube(query: string, params: CurationParams & { duration?: 'short'|'medium'|'long' }): Promise<Array<{ id: string; title: string; channelTitle: string }>>`
  - `getVideoStats(ids: string[]): Promise<Array<{ id: string; viewCount: number; publishedAt: string; duration: string; status: { privacyStatus?: string; embeddable?: boolean } }>>`
  - `curateYouTube(params: CurationParams): Promise<ResourceCandidate[]>` (uses both functions, ranking + cutoff, returns sorted candidates)
- Behavior:
  - Cache keys: `buildCacheKey({ query, source: 'youtube', paramsVersion: 'search-v1', cacheVersion })` for search; `'stats-v1'` for stats.
  - Use `getOrSetWithLock` for both stages with appropriate TTLs and negative cache for empty results.
  - REST calls (quota-aware with fields projection):
    - `search.list` with `part=snippet`, `type=video`, `maxResults=10`, filters: `videoDefinition=high`, optional `videoDuration`, `fields=items(id/videoId,snippet/title,snippet/channelTitle)`.
    - `videos.list` batch ids with `part=statistics,snippet,contentDetails,status`, `fields=items(id,statistics(viewCount),snippet(publishedAt),contentDetails(duration),status(privacyStatus,embeddable))`.
  - Scoring: map to `ResourceCandidate` with `source='youtube'`; compute via `scoreYouTube`; filter `< minScore`; sort desc; early-stop if 3 high-scorers reached.

## Step 8: Docs adapter — `src/lib/curation/docs.ts`

- Exports:
  - `searchDocs(query: string, params: CurationParams): Promise<Array<{ url: string; title: string; snippet?: string }>>`
  - `curateDocs(params: CurationParams): Promise<ResourceCandidate[]>`
- Behavior:
  - If `curationConfig.cseId` and `cseKey` present: call Google Programmable Search (`num=5`, `siteSearch` allowlist for topic), project minimal fields; cache with `stage='search'` and negative cache.
  - Else fallback heuristics: map keywords → canonical docs (e.g., react.dev, typescriptlang.org, developer.mozilla.org, nodejs.org); return 1–3 URLs.
  - Canonicalize URLs: `canonicalizeUrl`; validate with `headOk` (cache via `docs-head` stage if integrated in callers); discard non-OK.
  - Score with `scoreDoc` (includes domain authority + relevance), apply cutoff, sort desc. Prefer diversity when combined by caller.

## Step 9: DB resources upsert/attachments — `src/lib/db/queries/resources.ts`

- Exports:
  - `upsertResource(db, r: ResourceCandidate): Promise<string /*resourceId*/>`
  - `attachTaskResources(db, taskId: string, resourceIds: string[]): Promise<void>`
  - `upsertAndAttach(db, taskId: string, candidates: ResourceCandidate[]): Promise<string[]>` (helper: upsert 1–3, attach ordered, idempotent)
- Behavior:
  - Map `source` to DB enum via `mapSourceToDbResourceType`.
  - Upsert on `resources.url` unique; set `type`, `title`, `domain` (parsed from URL), `durationMinutes` when available.
  - Attachment rules: stable ordering (start at 1, preserve order provided), avoid duplicates using unique `(taskId, resourceId)`, all inside a transaction.

## Essential signatures (concise)

```ts
// youtube.ts
export async function curateYouTube(
  params: CurationParams
): Promise<ResourceCandidate[]>;

// docs.ts
export async function curateDocs(
  params: CurationParams
): Promise<ResourceCandidate[]>;

// resources.ts
export async function upsertResource(
  db: typeof import('@/lib/db/drizzle').db,
  r: ResourceCandidate
): Promise<string>;
export async function attachTaskResources(
  db: typeof import('@/lib/db/drizzle').db,
  taskId: string,
  resourceIds: string[]
): Promise<void>;
export async function upsertAndAttach(/* ... */): Promise<string[]>;
```

## Notes on caching and locks

- Use `getOrSetWithLock` per stage to dedupe concurrent fetches.
- Use negative cache for empty search results (short TTL).
- Version keys with `curationConfig.cacheVersion`; bump invalidates.

## Testing (Phase 3 add-ons)

- Unit (new):
  - `tests/unit/curation/youtube.adapter.spec.ts`: param shaping, batching, cutoff, early-stop, cache hits (mock cache + fetch).
  - `tests/unit/curation/docs.adapter.spec.ts`: CSE path, fallback heuristics, HEAD validation, canonicalization, cutoff.
  - `tests/unit/db/resources.queries.spec.ts`: upsert by URL, type mapping, attachment order/idempotency, transaction rollback on error.
- Integration:
  - `tests/integration/curation/persistence.spec.ts`: end-to-end upsert+attach 1–3 resources for a fake task; assert stable ordering and no dupes.

## Non-goals in this phase

- Worker orchestration and prompts (later phases).
- UI changes.

## Risk/mitigation

- API quotas: rely on cache and early-stop; batch stats.
- Link rot: filter via `headOk`; cache doc HEADs.
- DB contention: unique constraints + transaction retries if needed.

## To-dos

- [x] Implement YouTube adapter with caching, scoring, cutoff, early-stop
- [x] Implement Docs adapter with CSE + heuristics, HEAD validation, scoring
- [x] Create DB upsert and task attachment utilities with transactions
- [x] Add unit tests for adapters and DB queries (mocks, cutoff, ordering)
- [x] Add integration test for upsert+attach end-to-end
