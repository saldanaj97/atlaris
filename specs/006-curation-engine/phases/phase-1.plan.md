<!-- c5577047-76f1-4c1a-83da-9d575d5ed7e5 ae7e117b-30e7-49c8-82a6-66c90aed5f21 -->

# Phase 1 – Curation Foundations Plan

### Scope

Implement Tasks.md Phase 1: (1) Prep & configuration, (2) DB migration for `resource_search_cache`, (3) Shared curation types. Use pnpm, Drizzle, TypeScript. No runtime changes beyond config reads.

### Files to add/update

- Add: `src/lib/curation/config.ts` (centralized env/config)
- Add: `src/lib/curation/types.ts` (shared curation types)
- Update: `src/lib/db/schema.ts` (define `resource_search_cache`)
- Auto-gen: `src/lib/db/migrations/*` (drizzle-kit migration for cache table)
- Update docs: `README.md` (Environment variables) and/or `docs/project-info/project-description.md` env section
- Verify only (change if needed): `src/components/plans/OnboardingForm.tsx` (numeric `weeklyHours`, valid `deadlineDate`)

### Step 1 — Prep and configuration

1. Create `src/lib/curation/config.ts` to validate and expose env with sane defaults.
   - Read: `YOUTUBE_API_KEY` (required), `GOOGLE_CSE_ID`/`GOOGLE_CSE_KEY` (optional), `ENABLE_CURATION` (default true in dev/test), `MIN_RESOURCE_SCORE` (default 0.6), `CURATION_CACHE_VERSION` (default "1"), `CURATION_LRU_SIZE` (default 500), TTLs (`CURATION_CACHE_TTL_SEARCH_DAYS`=7, `CURATION_CACHE_TTL_YT_STATS_DAYS`=2, `CURATION_CACHE_TTL_DOCS_HEAD_DAYS`=5, `CURATION_NEGATIVE_CACHE_TTL_HOURS`=4).
   - Export typed getters/constants; use Zod for validation to align with repo standards.
   - Provide a small internal helper `isDevOrTest()` for defaults.

2. Document required/optional envs in `README.md` with brief descriptions and defaults. Note feature flag behavior for `ENABLE_CURATION`.

3. Verify onboarding output:
   - Confirm `weeklyHours` is numeric (not string) and `deadlineDate` is a valid ISO date before orchestrator use. If not, add mapping in `src/components/plans/OnboardingForm.tsx`.

Minimal config shape (illustrative):

```ts
// src/lib/curation/config.ts
import { z } from 'zod';
const schema = z.object({
  YOUTUBE_API_KEY: z.string().min(1),
  GOOGLE_CSE_ID: z.string().optional(),
  GOOGLE_CSE_KEY: z.string().optional(),
  ENABLE_CURATION: z.string().optional(),
  MIN_RESOURCE_SCORE: z.string().optional(),
  CURATION_CACHE_VERSION: z.string().optional(),
  CURATION_LRU_SIZE: z.string().optional(),
  CURATION_CACHE_TTL_SEARCH_DAYS: z.string().optional(),
  CURATION_CACHE_TTL_YT_STATS_DAYS: z.string().optional(),
  CURATION_CACHE_TTL_DOCS_HEAD_DAYS: z.string().optional(),
  CURATION_NEGATIVE_CACHE_TTL_HOURS: z.string().optional(),
});
export const config = (() => {
  const env = schema.parse(process.env);
  const devOrTest = process.env.NODE_ENV !== 'production';
  return {
    youtubeApiKey: env.YOUTUBE_API_KEY,
    cseId: env.GOOGLE_CSE_ID,
    cseKey: env.GOOGLE_CSE_KEY,
    enableCuration: env.ENABLE_CURATION
      ? env.ENABLE_CURATION === 'true'
      : devOrTest,
    minResourceScore: env.MIN_RESOURCE_SCORE
      ? Number(env.MIN_RESOURCE_SCORE)
      : 0.6,
    cacheVersion: env.CURATION_CACHE_VERSION ?? '1',
    lruSize: env.CURATION_LRU_SIZE ? Number(env.CURATION_LRU_SIZE) : 500,
    ttl: {
      searchDays: Number(env.CURATION_CACHE_TTL_SEARCH_DAYS ?? 7),
      ytStatsDays: Number(env.CURATION_CACHE_TTL_YT_STATS_DAYS ?? 2),
      docsHeadDays: Number(env.CURATION_CACHE_TTL_DOCS_HEAD_DAYS ?? 5),
      negativeHours: Number(env.CURATION_NEGATIVE_CACHE_TTL_HOURS ?? 4),
    },
  } as const;
})();
```

### Step 2 — Database migration: cache table

1. Define the table in `src/lib/db/schema.ts` using Drizzle for Postgres; fields and indexes per Tasks.md:
   - Columns: `id uuid pk`, `query_key text unique`, `source text`, `params jsonb`, `results jsonb`, `created_at timestamptz default now()`, `expires_at timestamptz`.
   - Indexes: unique(`query_key`), and `(source, expires_at)` for cleanup queries.
   - No RLS (internal service table); keep consistent with existing schema conventions.

2. Generate and apply migration:
   - Run `pnpm db:generate` → emits SQL into `src/lib/db/migrations/*`.
   - Run `pnpm db:migrate` locally and in test environment to validate.

3. Sanity check by importing the new table in a local query file (read-only) to ensure types are emitted correctly.

Illustrative table snippet (schema.ts):

```ts
// resource_search_cache table (drizzle-orm)
export const resourceSearchCache = pgTable('resource_search_cache', {
  id: uuid('id').defaultRandom().primaryKey(),
  queryKey: text('query_key').notNull().unique(),
  source: text('source').notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull(),
  results: jsonb('results').$type<unknown[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const resourceSearchCacheSourceExpiresIdx = index(
  'resource_search_cache_source_expires_idx'
).on(resourceSearchCache.source, resourceSearchCache.expiresAt);
```

### Step 3 — Types and shared interfaces

Add `src/lib/curation/types.ts` to standardize curation interfaces across adapters and ranking.

Minimal type shapes (illustrative):

```ts
// src/lib/curation/types.ts
export type CurationSource = 'youtube' | 'doc';
export type DbResourceType = 'youtube' | 'article' | 'course' | 'doc' | 'other';
export type ScoreComponents = {
  popularity?: number; // [0,1]
  recency?: number; // [0,1]
  relevance?: number; // [0,1]
  durationFit?: number; // [0,1]
  authority?: number; // [0,1]
};
export type Score = {
  blended: number; // [0,1]
  components: ScoreComponents;
  scoredAt: string; // ISO timestamp
};
export type ResourceCandidate = {
  url: string;
  title: string;
  source: CurationSource;
  score: Score;
  metadata: Record<string, unknown>;
};
export type CurationParams = {
  query: string;
  minScore: number;
  maxResults?: number; // 1–3 typical
  cacheVersion: string;
};
export type CurationResult = {
  candidates: ResourceCandidate[]; // already filtered by minScore and sorted desc
};
export function mapSourceToDbResourceType(s: CurationSource): DbResourceType {
  return s === 'youtube' ? 'youtube' : 'doc';
}
```

### Acceptance criteria

- Env/config centralization exists with type-safe reads and defaults; `ENABLE_CURATION` feature flag wired.
- `README.md` documents all curation-related env vars with defaults and descriptions.
- `resource_search_cache` exists in `schema.ts`, generated migration present under `src/lib/db/migrations/*`, and applies cleanly.
- Shared curation types file exists and is importable by future modules.
- Onboarding emits numeric `weeklyHours` and valid `deadlineDate` (confirmed or corrected).

### Notes

- Follow repo ESLint/type-check rules; no `any`/`unknown` in finalized code.
- Use pnpm for all commands.
- Do not implement cache logic, adapters, or ranking yet—only Phase 1 foundations.

### To-dos

- [ ] Add typed curation config at src/lib/curation/config.ts with env defaults
- [ ] Document env vars and feature flag in README.md
- [ ] Define resource_search_cache table in src/lib/db/schema.ts
- [ ] Generate and apply migration for resource_search_cache
- [ ] Create shared types at src/lib/curation/types.ts
- [ ] Verify/ensure numeric weeklyHours and valid deadlineDate in OnboardingForm
