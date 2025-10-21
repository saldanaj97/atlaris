# MVP Open Items

This checklist summarizes outstanding work based on the MVP breakdown, mapped to what exists in the repository today. Items are grouped by area; treat unchecked items as not implemented or partially implemented.

## Onboarding

- [ ] Add deadline input to onboarding and persist (schema supports `deadlineDate`).
- [ ] Optionally collect start date and pass to scheduling.
- [ ] Include deadline and pacing guidance in AI prompt/generation.

## Content Engine (Curation + AI)

- [ ] Curation pipeline to fetch/rank resources (YouTube/docs/free MOOCs) and attach to tasks.
- [ ] Ensure tasks include concise micro‑explanations/exercises where appropriate.
- [ ] Pacing logic to adjust plan volume using weeklyHours + deadline (not just hours).

## Plan Structuring

- [ ] Week‑based milestones with derived session/day breakdown (dated schedule).
- [ ] Ensure every task links at least one curated resource.
- [ ] Surface time estimates with schedule context in UI.

## Dynamic Sync

- [ ] Notion export: OAuth, token storage, mapping, one‑off/delta sync endpoints; UI action.
- [ ] Google Calendar sync: OAuth, scheduling to events with reminders; UI action.
- [ ] Enforce export usage/tier gates when invoking integrations.

## Freemium SaaS Model

- [ ] Free tier cap (e.g., “up to 2 weeks”): enforce in generation or post‑processing.
- [ ] Regeneration/customization: API route + worker job + UI control.
- [ ] Priority topic support (business logic + any queue priority mapping + UI copy).

## Design & Branding

- [ ] Define brand color tokens (e.g., `--color-learning-*`) and wire into Tailwind theme.
- [ ] Replace placeholder gradients/classes with branded equivalents and ensure contrast.
- [ ] Update imagery (hero/illustrations), favicon/OG images, and site metadata.
- [ ] Align pricing visuals/copy with actual tier gating/limits.

## Developer Notes (where to integrate)

- Forms/schemas: `src/components/plans/OnboardingForm.tsx`, `src/lib/validation/learningPlans.ts`.
- AI prompts & orchestration: `src/lib/ai/prompts.ts`, `src/lib/ai/orchestrator.ts`.
- Persistence/queries: `src/lib/db/schema.ts`, `src/lib/db/queries/**`.
- Export buttons/UI: `src/components/plans/ExportButtons.tsx`.
- Future integrations: `src/app/api/v1/auth/notion/callback/route.ts`, `src/app/api/v1/auth/google/callback/route.ts`.
