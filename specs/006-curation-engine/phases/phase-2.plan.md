<!-- 7c96a819-ae05-43f2-a02f-c2dfa465b1f5 4cd273d4-3e21-4181-a2d4-2f79c605f3c0 -->

# Phase 2 – Curation Core (Steps 4–6)

## Scope

- Deliver cache module with TTLs, negative cache, and concurrency dedupe.
- Deliver validation for docs (HEAD) and YouTube availability.
- Deliver ranking with normalized scoring, cutoff, diversity, and early‑stop selection.
- No external API calls in this phase; adapters will consume these utilities next.

## Files and modules

- `src/lib/curation/cache.ts` (new)
- `src/lib/curation/validate.ts` (new)
- `src/lib/curation/ranking.ts` (new)
- Uses existing: `src/lib/curation/types.ts` (extend if needed), `src/lib/db/drizzle.ts`, `src/lib/db/schema.ts` (`resource_search_cache`), `src/lib/utils.ts`.

## Step 4: Cache module (`src/lib/curation/cache.ts`)

- Responsibilities: key normalization/hash, stage‑specific TTLs, in‑process LRU, Postgres TTL cache R/W, negative cache, `getOrSetWithLock` using Postgres advisory locks, cleanup expired.
- Exports:

```ts
export type CacheStage = 'search' | 'yt-stats' | 'docs-head' | 'negative';
export type CurationCacheKey = {
  queryKey: string;
  source: 'youtube' | 'doc';
  paramsHash: string;
};
export type CachedPayload<T> = {
  results: T;
  scoredAt?: string;
  expiresAt: string;
  cacheVersion: string;
};

export function buildCacheKey(input: {
  query: string;
  source: 'youtube' | 'doc';
  paramsVersion: string;
  cacheVersion: string;
}): CurationCacheKey;
export function getCachedResults<T>(
  key: CurationCacheKey
): Promise<CachedPayload<T> | null>;
export function setCachedResults<T>(
  key: CurationCacheKey,
  stage: CacheStage,
  payload: CachedPayload<T>
): Promise<void>;
export function getOrSetWithLock<T>(
  key: CurationCacheKey,
  stage: CacheStage,
  fetcher: () => Promise<T>
): Promise<T>;
export function cleanupExpiredCache(limit?: number): Promise<number>; // returns rows deleted
```

- Implementation notes:
  - Keying: `hashKey(normalize(query)+source+paramsVersion+process.env.CURATION_CACHE_VERSION)` using a stable SHA‑256 helper.
  - LRU: implement minimal in‑process LRU (capacity from `CURATION_LRU_SIZE` default 500).
  - TTLs: environment overrides: `CURATION_CACHE_TTL_SEARCH_DAYS` (7), `CURATION_CACHE_TTL_YT_STATS_DAYS` (2), `CURATION_CACHE_TTL_DOCS_HEAD_DAYS` (5), `CURATION_NEGATIVE_CACHE_TTL_HOURS` (4).
  - Negative cache: store ephemeral misses (empty arrays or explicit marker) under `stage='negative'`.
  - Concurrency dedupe: `SELECT pg_try_advisory_lock(hash)` before `fetcher`; always `pg_advisory_unlock` in `finally`.
  - DB shape: uses `resource_search_cache` with `query_key`, `source`, `params` (JSON with `stage`), `results`, `expires_at`.
  - Rescoring: allow payloads to carry `score`/`scoredAt`; the module does not compute scores.

## Step 5: Validation module (`src/lib/curation/validate.ts`)

- Responsibilities: docs link health via HTTP HEAD, YouTube availability flags sanity, URL canonicalization.
- Exports:

```ts
export type HeadCheckResult = {
  ok: boolean;
  status?: number;
  finalUrl?: string;
};
export async function headOk(
  url: string,
  timeoutMs?: number
): Promise<HeadCheckResult>;
export function isYouTubeEmbeddable(status: {
  privacyStatus?: string;
  embeddable?: boolean;
}): boolean;
export function canonicalizeUrl(url: string): string; // strip common tracking params safely
```

- Implementation notes:
  - Use `fetch` + `AbortController` for HEAD with redirect follow; success on 200; treat 3xx as valid if final target resolves to 200; drop 4xx/5xx.
  - YouTube: `privacyStatus!=='private' && embeddable===true`.
  - Canonicalization: remove `utm_*`, `ref`, `fbclid` when present.

## Step 6: Ranking module (`src/lib/curation/ranking.ts`)

- Responsibilities: compute normalized per‑source scores, blend with weights, enforce cutoff, and select 1–3 with diversity preference and early‑stop fill.
- Exports:

```ts
import { ResourceCandidate, CurationParams } from './types';

export type ScoreComponents = {
  popularity: number;
  recency: number;
  relevance: number;
  suitability?: number;
  authority?: number;
};
export type Scored<T extends ResourceCandidate = ResourceCandidate> = T & {
  score: number;
  components: ScoreComponents;
};

export function scoreYouTube(c: ResourceCandidate, now?: Date): Scored;
export function scoreDoc(c: ResourceCandidate): Scored;
export function selectTop(
  candidates: Scored[],
  opts: { minScore: number; maxItems?: number; preferDiversity?: boolean }
): Scored[];
```

- Scoring design:
  - YouTube: `popularity = log10(viewCount+1) normalized`, `recency = exp(-ageDays/decayHalfLife)` (e.g., 365d), `relevance = string match to title/keywords`, `suitability = duration fit`.
  - Docs: `authority` by domain allowlist weight, `relevance` by snippet/title match; `recency` optional if available.
  - Blend weights (tunable, env‑overridable): e.g., YT: 0.45 pop, 0.25 recency, 0.25 relevance, 0.05 suitability; Docs: 0.6 authority, 0.3 relevance, 0.1 recency.
- Selection:
  - Enforce `minScore` (default 0.6, from `MIN_RESOURCE_SCORE`).
  - Return up to 3 by score; if `preferDiversity`, include at least one from each source when available without violating score order too much (tie‑break within ±0.03).
  - Early‑stop: if 3 ≥ minScore from first source, skip others unless cheap cached docs are available (callers pass those).

## Testing (unit‑level for Phase 2)

- `cache.ts`: LRU capacity/eviction, TTL resolution per stage, negative cache behavior, get/set roundtrip, `getOrSetWithLock` dedupe under simulated parallelism, version misses on cacheVersion change, cleanup deletes expired.
- `validate.ts`: HEAD success/redirect/timeout paths (mock fetch), URL canonicalization, YouTube status rules.
- `ranking.ts`: component normalization, blended scores, cutoff enforcement, diversity preference, early‑stop behavior in `selectTop`.

## Integration touchpoints (later phases)

- Adapters (`youtube.ts`, `docs.ts`) use: `buildCacheKey`, `getOrSetWithLock`, `headOk`, `scoreYouTube`, `scoreDoc`, `selectTop`.
- Worker uses: `selectTop` orchestration logic and cache helpers for cleanup.

## Config

- Env vars consumed: `CURATION_CACHE_VERSION`, TTL overrides, `MIN_RESOURCE_SCORE`, `CURATION_LRU_SIZE`.
- Provide sane fallbacks if missing; log warnings in dev/test.

## To-dos

- [x] Create cache module with LRU, TTLs, negative cache, DB R/W, advisory locks
- [ ] Add unit tests for cache behaviors, TTLs, negative cache, dedupe, cleanup
- [x] Create validation module (HEAD checks, YT availability, URL canonicalize)
- [x] Add unit tests for HEAD outcomes, canonicalization, YT rules
- [x] Create ranking module with normalized components, blending, cutoff, diversity
- [ ] Add unit tests for scoring components, blending, cutoff, diversity, early-stop
