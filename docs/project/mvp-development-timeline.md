# 📆 Two-Week Timeline

## Day 1 – Project Setup

- [x] Initialize Next.js app & Git repo.
- [x] Add Tailwind + shadcn/ui.
- [x] Set up Supabase project (Auth + Postgres).
- [x] Define DB schema (users, plans, milestones, tasks).
- [ ] Deploy empty skeleton app to Vercel. (push back for now not a priority)

## Day 2 – Auth & Database

- [x] Implement Google OAuth with Cleark and Supabase.
- [x] Test sign up / log in flow.
- [x] Confirm DB schema migrations work.
- [x] Add basic session management in frontend.

## Day 3 – Plan Creation API

- [ ] Create /api/create-plan endpoint.
- [ ] Connect to OpenAI (return dummy JSON for now).
- [ ] Save returned roadmap JSON into DB.
- [ ] Confirm roadmap is persisted correctly.

## Day 4 – Roadmap Preview

- [ ] Build simple roadmap preview page (list milestones/tasks).
- [ ] Pull roadmap from DB and render for user.
- [ ] Add error handling for missing data.

## Day 5 – User Inputs

- [ ] Add form for: Topic, Skill Level, Weekly Hours, Deadline.
- [ ] Pass inputs to backend /api/create-plan.
- [ ] Store preferences in DB.

## Day 6 – AI Roadmap Structuring

- [ ] Enhance OpenAI prompt → generate structured milestones/tasks.
- [ ] Persist results into milestones + tasks tables.
- [ ] Display tasks grouped by week in frontend.

## Day 7 – Plan Regeneration

- [ ] Add “Regenerate Plan” button → calls API again.
- [ ] Overwrite existing roadmap in DB.
- [ ] Add simple loading states and error messaging.

## Day 8 – Notion Export

- [ ] Set up Notion OAuth.
- [ ] Build /api/export/notion endpoint.
- [ ] Map roadmap tasks into Notion database schema.
- [ ] Test end-to-end: Plan → Export → Notion.

## Day 9 – Stripe Integration

- [ ] Set up Stripe checkout flow (test mode).
- [ ] Add webhook endpoint for subscription events.
- [ ] Store subscription status in DB.
- [ ] Gating logic: free users limited to 1 roadmap.

## Day 10 – Premium Feature Gating

- [ ] Lock dynamic Notion sync behind premium.
- [ ] Add frontend upsell messaging when free users try to regenerate/export.
- [ ] Verify upgrade → unlocks features.

## Day 11 – Dashboard

- [ ] Build dashboard page listing all plans.
- [ ] Show % complete per plan.
- [ ] Add ability to mark tasks complete (update DB).

## Day 12 – Weekly Summary Emails

- [ ] Set up Resend (or Postmark) for transactional email.
- [ ] Create cron job (Vercel cron or Supabase function).
- [ ] Send weekly summary: upcoming tasks per user.

## Day 13 – Testing & Polish

- [ ] Test auth, plan creation, AI roadmap, Notion export, Stripe.
- [ ] Validate failure cases (invalid OAuth, Stripe errors, bad inputs).
- [ ] Clean up UI: minimal branding + landing page copy.

## Day 14 – Launch

- [ ] Final deployment to Vercel production.
- [ ] Run smoke tests on production endpoints.
- [ ] Share link with early testers (friends, dev community).
- [ ] Gather feedback + create backlog for v2 (Google Calendar, better AI prompts, etc.).
