# Usage Analytics Metric Contract

This contract defines what user-facing usage analytics may promise from current
completion state and append-only learning activity history.

**Last Updated:** August 2026

## Shipped surfaces

| Route | Status |
| ----- | ------ |
| `/analytics` | Redirects to `/analytics/usage` |
| `/analytics/usage` | **Shipped** — completion metrics, estimated completed time, streaks, weekly trends from `learning_activity_events` |
| `/analytics/achievements` | **Placeholder** — static “coming soon” UI; no badge persistence or unlock logic |

Page data (`src/app/(app)/analytics/usage/page.tsx`):

1. Plan summaries via `listUsageAnalyticsPlanSummaries` (reuse existing completion projections)
2. Activity rows via `getLearningActivityEventsForUser`
3. Model build via `buildUsageAnalyticsModel` in `usage-analytics-model.ts`

## Metric wording

Use this intent for the MVP time metric (UI tile label may shorten the title):

- Intent label: `Estimated completed learning time`
- Meaning: sum of `tasks.estimated_minutes` for tasks currently marked complete — **not** recorded study duration
- UI today: tile title **Completed time** with subtitle that references estimated completed learning time from plans

Historical empty state: streaks and weekly summaries only reflect progress changes recorded after activity history launched. Pre-launch study is not backfilled. The model exposes `history.hasActivity`; prefer explicit no-history copy when extending the UI rather than inventing past streaks.

## Metric Glossary

| Metric | Source of truth | Classification | Contract |
| --- | --- | --- | --- |
| `task_completion` | `task_progress.status = 'completed'` | Current-state | A task is complete only while the user's latest progress row for that task is `completed`. |
| `module_completion` | Existing completion read projections over module tasks | Current-state | A module is complete only when it has at least one task and every task is currently complete. |
| `plan_completion` | Existing completion read projections over plan tasks | Current-state | `completedTasks / totalTasks`; plans with zero tasks have `0` completion. |
| `estimated_completed_learning_time` | `tasks.estimated_minutes` for currently completed tasks | Current-state, estimated | Sum task estimates for tasks currently marked complete. This is not actual recorded study time. |
| `actual_study_time` | Future append-only learning activity history | Historical, actual | Unavailable until explicit study-duration events or another accepted actual-time source exists. |
| `streaks` | `learning_activity_events` | Historical | Count local study days from recorded progress-change activity. Current streak may continue through yesterday when today has no activity yet. |
| `weekly_summaries` | `learning_activity_events` | Historical | Summarize recorded progress-change activity in Monday-start learning weeks. |
| `trends` | `learning_activity_events` | Historical | Show recent weekly progress-change and completed-event history from recorded events only (UI uses an 8-week window). |

## Activity semantics

- A study day is any calendar day (in the user's analytics timezone) with at least one recorded task progress status change.
- Activity history is forward-only from the activity-history launch date.
- `learning_activity_events` is written by the DB trigger `private.record_learning_activity_event()` on `task_progress` status changes. Authenticated clients have select-only access; inserts are server-owned.
- Rows cascade-delete with their user, plan, module, or task.
- Do not reconstruct complete pre-launch history from mutable current-state rows.
- Streaks support both global and per-plan views in the model.
- Date bucketing uses `user_preferences.analytics_timezone` (default `UTC`). `/analytics/usage` may update the setting from the browser IANA timezone after authenticated render (`UsageAnalyticsTimezoneSync` → `syncAnalyticsTimezoneAction` or `PUT /api/v1/user/profile`).

## Guardrails

- Do not use synthetic dashboard activity from
  `src/app/(app)/dashboard/components/activity-utils.ts` as analytics evidence.
- Do not infer streaks or weekly history from `learning_plans.updated_at`,
  `task_progress.completed_at`, plan timestamps, or dashboard activity items.
- Do not backfill full historical study sessions from data that was never
  recorded.
- Reuse existing completion projections instead of creating a parallel
  completion model.
- Keep operational telemetry, billing usage metrics (Settings `#usage`), and
  user-facing learning analytics separate.

## Relevant Code Surfaces

| Concern | Path |
| ------- | ---- |
| Usage page | `src/app/(app)/analytics/usage/page.tsx` |
| Model + charts | `usage-analytics-model.ts`, `usage-analytics-content.tsx`, `usage-analytics-charts.tsx` |
| Completion calculations | `src/features/plans/read-projection/completion-metrics.ts` |
| Plan summary projection | `src/features/plans/read-projection/summary-projection.ts` |
| Activity events schema | `learningActivityEvents` in `supabase/schema/tables/tasks.ts` |
| Analytics timezone | `user_preferences.analytics_timezone` (`supabase/schema/tables/user-preferences.ts`) |
| Timezone helpers | `src/shared/analytics/learning-activity-time.ts` |
| Achievements placeholder | `src/app/(app)/analytics/achievements/page.tsx` |

## Related docs

- [user-preferences.md](./user-preferences.md) — timezone + settings ledger
- [schema-overview.md](../database/schema-overview.md)
