# 📆 Two-Week Timeline (Adjusted for Vertical Slice First)

> Goal: Ship a usable end-to-end plan lifecycle (create → view → progress) before layering AI, exports, and billing.

## Day 1 – Project Setup (Done)

Outcome: Foundational project scaffold + database schema established; environment reproducible.

- [x] Initialize Next.js app & Git repo.
- [x] Add Tailwind + shadcn/ui.
- [x] Set up Supabase project (Auth + Postgres).
- [x] Define DB schema (users, plans, milestones/modules, tasks).

## Day 2 – Auth & Database (Done)

Outcome: Users can authenticate; sessions persist; database migrations are trusted.

- [x] Implement Google OAuth with Clerk and Supabase.
- [x] Test sign up / log in flow.
- [x] Confirm DB schema migrations work.
- [x] Add basic session management in frontend.

---

## Day 3 – 4: Core Vertical Slice (Plans Shell → Mock Content)

Outcome: Can create a plan, see it in list, open detail, and (after mock generation) view modules/tasks.

- [x] Pages: `/plans`, `/plans/new`, `/plans/[id]` (list, create, detail)
  - [x] List page: fetch user plans, empty state
  - [x] New page: minimal form (topic only for now)
  - [x] Detail page: pending vs ready placeholder UI
- [x] API: POST plan (status `pending`)
- [x] Mock generation script inserts modules + tasks (2–3 modules, ordered tasks) → flips status to `ready`
- [x] Ordering: ensure sequential `order` values in modules/tasks
- [x] Empty/pending states implemented
- [x] Basic navigation links between pages

Acceptance: Manual flow works locally without manual SQL edits.

## Day 5: Hardening & Observability

Outcome: Core slice stabilized with logging, safety checks, and clean type/lint baseline.

- [x] Defensive null/undefined guards in plan detail
- [x] Convert any incorrect conditional query logic to proper Drizzle `and(...)` usage
- [ ] Run `pnpm lint` + type check → zero errors
- [x] Add TODO comments for any discovered schema adjustments instead of changing schema mid-sprint (no new schema gaps identified today)

## Day 6: Task Progress Foundations

Outcome: Users can mark tasks complete; per-plan progress surfaced numerically.

- [ ] `task_progress` read + write helper functions
- [ ] Mutation endpoint: mark task complete / uncomplete
- [ ] UI: show per-plan progress fraction (e.g., 3 / 15) on list + detail header
- [ ] Guard against double insert (use upsert or existence check)

## Day 7: First Real AI Plan Generation

Outcome: Plans can transition from pending to ready via real AI-generated structure with fallback resilience.

- [ ] Replace mock generator path with AI invocation (OpenAI or provider) returning structured modules/tasks
- [ ] Timeout fallback → leaves plan in `pending` with retry path
- [ ] Persist `plan_generations` entry (status, prompt, model, token counts placeholder)
- [ ] Basic error classification (validation vs provider error vs rate limit)

## Day 8: Regeneration & History

Outcome: Users can regenerate plans; each attempt recorded with visible history and concurrency protection.

- [ ] “Regenerate” button on plan detail
- [ ] Store each run in `plan_generations` (append, do not overwrite history)
- [ ] Concurrency guard: ignore if another generation in-progress
- [ ] UI: simple list of past generations (timestamp + status)

## Day 9: UX & Resilience Pass

Outcome: User flow feels reliable with consistent states, reduced errors, and basic performance safeguards.

- [ ] Consistent loading + retry states (plan pending, generation error)
- [ ] Structured error responses (code + message) surfaced in UI
- [ ] Minimal analytics/log hooks (console or simple table) for: plan created, generation started, generation completed/failed
- [ ] Performance sanity: avoid N+1 queries (batch fetch modules/tasks)

## Day 10: Notion Export (One-Way)

Outcome: A plan can be exported once to Notion; user receives clear success or failure feedback.

- [ ] Notion OAuth flow
- [ ] One-shot export endpoint (no sync) → creates Notion database/page
- [ ] Map tasks with order + status (incomplete by default)
- [ ] Basic success/failure feedback in UI

## Day 11: Billing Design & Prep

Outcome: Pricing boundaries and gating rules clarified; UI placeholders ready; schema supports subscription state.

- [ ] Define free vs premium limits (e.g., 1 active plan + 3 regenerations)
- [ ] Schema / column adjustments if needed (subscription status field already?)
- [ ] Frontend gating messaging placeholders
- [ ] Document gating logic decisions

## Day 12: Stripe Integration

Outcome: Users can upgrade; subscription state drives backend enforcement of premium limits.

- [ ] Checkout session (test mode)
- [ ] Webhook to update subscription status
- [ ] Gating enforcement in API (plan creation/regeneration/export)
- [ ] UI: upgrade CTA when blocked

## Day 13: Testing & Polish

Outcome: Core scenarios manually verified; accessibility and UX refinements applied; ready for production deploy.

- [ ] Manual regression: auth → plan create → generation → progress → regenerate → export (if implemented)
- [ ] Edge cases: empty AI response, partial generation, network timeouts
- [ ] Accessibility pass on core pages (labels, keyboard, landmarks)
- [ ] Minimal branding + concise landing copy

## Day 14: Launch & Feedback

Outcome: Production deployment live; initial feedback loop established; backlog v2 seeded.

- [ ] Deploy to Vercel production
- [ ] Smoke test production endpoints
- [ ] Share with early testers / collect feedback
- [ ] Log initial backlog items for v2 (calendar sync, weekly summary emails, richer AI prompts)

---

### Deferred / Post-MVP Items (Parking Lot)

- Weekly summary emails / cron job
- Dynamic Notion sync (bi-directional updates)
- Advanced AI personalization prompts
- Calendar integration (Google / ICS)
- Analytics dashboard / cohort metrics

---
