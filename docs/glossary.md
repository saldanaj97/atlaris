# Glossary

Terms in this repo that mean more than one thing, or that docs, UI copy, and code name differently. Read this before searching or editing when a word like "plan", "jobs", "queue", or "worker" could point at two places.

Paths are relative to the repo root. Entries marked **rename pending** describe the name as it is today; another change is renaming it, and this page is updated when it lands. The architecture behind these terms lives in the linked docs. The generated overview is the [codemap](./codemap/codemap.html) (data in [`codemap/codemap.json`](./codemap/codemap.json)); this glossary covers its word mismatches.

## Quick lookup

| Say this | Not this | Where it lives |
|----------|----------|----------------|
| tier, subscription tier | plan | `SubscriptionTier` in `src/shared/types/billing.types.ts`; `users.subscriptionTier` |
| learning plan | plan, roadmap | `src/features/plans`, table `learning_plans` |
| `job_queue` (Postgres) | the queue | `supabase/schema/tables/jobs.ts` |
| regeneration Cloudflare Queue | the queue | `workers/jobs/cloudflare.config.ts` |
| maintenance routes | internal worker routes | `src/app/api/internal/maintenance/**` |
| jobs Worker | jobs | `workers/jobs` |
| jobs dispatch (**rename pending**) | jobs | `src/features/jobs` |
| proxy | middleware | `src/proxy.ts` |
| lesson generation (module lessons) | lessons, lesson-content | see [Module lessons](#module-lessons) |

## Billing and plans

### Plan vs tier

"Plan" names two unrelated things.

- **Learning plan.** The generated course a user studies: modules, tasks, lessons. Code: `src/features/plans`, table `learning_plans`, `learningPlans` in `supabase/schema/tables/plans.ts`.
- **Subscription tier.** Free, Starter, or Pro. Code: `SubscriptionTier` (`src/shared/types/billing.types.ts`), column `users.subscriptionTier`.

In docs, tickets, and speech say **tier** for billing and **learning plan** for content. UI copy still says "Free plan" in places, meaning the tier (for example "Free plans always use the OpenRouter free router" in `ModelSelectionCard.tsx`) and also the one learning plan a Free account keeps (`FreeAccessPlanSelector`, "Choose a Free plan" in `PlansContent.tsx`).

Trap: `src/features/billing/plan-ai-budget.ts` and `PLAN_AI_BUDGET` are about spend **per learning plan**, not per tier. The per-tier daily AI spend pools are a separate mechanism (`src/features/billing/ai-spend-guard.ts`); model tiers are in [`docs/ai/available-models.md`](./ai/available-models.md).

### Roadmap

UI copy calls a learning plan its **roadmap** ("Review roadmap", "View roadmap", `RoadmapPreview`). Code never does, so searching the code for `roadmap` finds only presentation files. Search for `plan` instead.

### Pricing

"Pricing" is the `/pricing` page (`ROUTES.PRICING` in `src/features/navigation/routes.ts`). The code that implements it is `src/features/billing` (tiers, AI budget) and `src/features/billing/clerk-billing` (Clerk Billing sync). See [`docs/architecture/clerk-billing-architecture.md`](./architecture/clerk-billing-architecture.md).

## Jobs, workers, and queues

Four runtimes share the word "jobs" or "worker". Edit the right one.

| Name | What it is | Path |
|------|-----------|------|
| **Jobs Worker** (also "background jobs Worker") | The Cloudflare Worker: cron, queue consumer, Workflows. Deployed as `atlaris-jobs-staging` / `atlaris-jobs-production`. | `workers/jobs` |
| **Jobs dispatch** | App-side code that signs and sends commands to the Worker, plus `regeneration-run.ts`, which the Worker imports. Not the Worker. **Rename pending** (folder is `src/features/jobs`). | `src/features/jobs`, `src/lib/jobs-worker/client.ts` |
| **`job_queue`** | The Postgres table that records regeneration work. | `supabase/schema/tables/jobs.ts` |
| **Maintenance routes** | Operator-only HTTP routes inside the Next.js app. Not the Worker. | `src/app/api/internal/maintenance/**` |

When someone says "the jobs code", ask which row. Overview: [`docs/architecture/cloudflare-jobs-runtime.md`](./architecture/cloudflare-jobs-runtime.md), [`workers/AGENTS.md`](../workers/AGENTS.md).

### Signed command

A request from the app to the jobs Worker, HMAC-signed and sent by `sendJobsWorkerCommand` (`src/lib/jobs-worker/client.ts`) with the per-kind dispatchers in `src/features/jobs`. Docs call it a "signed command" or "signed enqueue/start". Contract: [`docs/architecture/cloudflare-jobs-runtime.md`](./architecture/cloudflare-jobs-runtime.md).

### The queue

"The queue" is two stores. Name which one.

- **`job_queue`** in Postgres is the record: status, attempts, payload.
- **The Cloudflare Queue** (`regeneration_queue` in `workers/jobs/cloudflare.config.ts`) only carries `{ v, jobId }` messages and has no dead-letter queue.

Fixing a "queue bug" in the wrong store loses or duplicates work. Runbook: [`docs/architecture/regeneration-worker-runbook.md`](./architecture/regeneration-worker-runbook.md).

### Internal worker routes, worker token

[`docs/architecture/internal-worker-routes.md`](./architecture/internal-worker-routes.md) is titled "Internal Worker Routes", and the code uses `internal-worker-access.ts` and `MAINTENANCE_WORKER_TOKEN`. Despite the "worker" in those names, these are **maintenance routes in the Next.js app**, called by an operator, not by the Cloudflare Worker. Say "maintenance routes" and "maintenance token" in prose. Do not rename `MAINTENANCE_WORKER_TOKEN`; that is a deploy change.

### Workflows folders

**Rename pending.** `src/features/plans/workflows` and `src/features/notifications/email/workflows` hold only shared **type** files. The real Workflow logic is under `workers/jobs/src/workflows`. A `workflows` folder under `src/` does not contain Workflow code.

### Background jobs vs Workflows vs cron

All three run in the jobs Worker. Cron triggers sweeps and scheduled email, the queue consumer handles regeneration, and Workflows run plan generation, module lessons, and email delivery. Table: [`docs/architecture/cloudflare-jobs-runtime.md`](./architecture/cloudflare-jobs-runtime.md).

## Features with several names

### Module lessons

One feature, several names: the directory and API route say **lesson-content** (`src/features/lesson-content`, `.../lesson-content/generate`), the Worker Workflow and the Flagship flag say **module lessons** (`ModuleLessonsWorkflow`, `module-lesson-generation`), and the UI says **lessons**. Grep for all three.

### Email delivery

"Email delivery", "email notifications", and "notifications/email" are the same area: `src/features/notifications/email`. Runbook: [`docs/architecture/email-notification-delivery-runbook.md`](./architecture/email-notification-delivery-runbook.md).

### Regeneration

"Regeneration" means regenerating a learning plan. There is no `regeneration` feature folder; the code is in `src/features/plans` plus the dispatch and run files in `src/features/jobs`.

## Request boundary and platform

### Proxy vs middleware

Next.js 16 calls it the **proxy**. The entry point is `src/proxy.ts`, which wraps `clerkMiddleware` from Clerk. Older docs and one file (`src/lib/proxy/middleware-policy.ts`) still say "middleware". They mean the proxy. "Auth wrappers" in the README means the request boundary (proxy, site gate, `src/lib/api`).

### `@supabase/*` imports

`@supabase/runtime`, `@supabase/rls`, and `@supabase/schema` are **path aliases to local files** in `supabase/` (Drizzle plus postgres-js), configured in `tsconfig.json`. They are not the Supabase npm SDK. The database layer is split between `supabase/` and `src/lib/db`. "RLS client" means the request-scoped DB client from `supabase/runtime.ts` (`getDb`). Docs: [`docs/database/client-usage.md`](./database/client-usage.md).

### AI Gateway

Docs and config comments say **Cloudflare AI Gateway** (in front of OpenRouter). The secrets are named `OPENROUTER_BASE_URL`, which holds the gateway's `/openrouter` URL, and `CF_AI_GATEWAY_TOKEN`. Same thing, two names. Config: `workers/jobs/cloudflare.config.ts`.

### Shared types

Shared application types live in `src/shared/types`. There is no `src/types`. `src/features/integrations` is a UI placeholder (see its `AGENTS.md`), and there is no `src/lib/integrations`.

### ui

"ui" is a synonym for the web UI: `src/app`, `src/components`, `src/hooks`.
