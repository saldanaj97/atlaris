# Usage Analytics Metric Contract

This contract defines what user-facing usage analytics may promise from current
completion state and append-only learning activity history.

## Shipped surface

`/analytics/usage` shows:

- Completion analytics and clearly labeled estimated completed learning time
  from current-state projections
- Streaks, weekly summaries, and trends from recorded `learning_activity_events`
  only (no pre-launch backfill)

Use this wording for the time metric:

- Label: `Estimated completed learning time`
- Helper copy: `Based on estimates for tasks currently marked complete. This is not recorded study time.`
- No-history copy: explain that streaks and weekly summaries start after task
  progress changes are recorded, and that earlier study activity is not
  backfilled.

## Metric Glossary

| Metric | Source of truth | Classification | Contract |
| --- | --- | --- | --- |
| `task_completion` | `task_progress.status = 'completed'` | Current-state | A task is complete only while the user's latest progress row for that task is `completed`. |
| `module_completion` | Existing completion read projections over module tasks | Current-state | A module is complete only when it has at least one task and every task is currently complete. |
| `plan_completion` | Existing completion read projections over plan tasks | Current-state | `completedTasks / totalTasks`; plans with zero tasks have `0` completion. |
| `estimated_completed_learning_time` | `tasks.estimated_minutes` for currently completed tasks | Current-state, estimated | Sum task estimates for tasks currently marked complete. This is not actual recorded study time. |
| `actual_study_time` | Future append-only learning activity history | Historical, actual | Unavailable until explicit study-duration events or another accepted actual-time source exists. |
| `streaks` | `learning_activity_events` | Historical | Count local study days from recorded post-launch progress-change activity. Current streak may continue through yesterday when today has no activity yet. |
| `weekly_summaries` | `learning_activity_events` | Historical | Summarize recorded progress-change activity in Monday-start learning weeks. |
| `trends` | `learning_activity_events` | Historical | Show recent weekly progress-change and completed-event history from recorded events only. |

## Activity history semantics

- A study day is any calendar day with at least one recorded task progress
  status change.
- Activity history is forward-only from the activity-history launch date.
- `learning_activity_events` records task progress status changes at the
  database boundary via trigger `record_learning_activity_event` on
  `task_progress` (function `private.record_learning_activity_event()`).
  Application code does not insert these rows. Authenticated role has SELECT
  only.
- Rows are deleted if their user, plan, module, or task is deleted.
- Do not reconstruct complete pre-launch history from mutable current-state
  rows.
- Streaks support both global and per-plan views.
- Date bucketing uses `user_preferences.analytics_timezone` (exposed on
  `ActorUser.analyticsTimezone`). New and existing users default to `UTC`;
  `/analytics/usage` may update the setting from the browser's IANA timezone
  after authenticated render.

## Guardrails

- Do not use synthetic dashboard activity from
  `src/app/(app)/dashboard/components/activity-utils.ts` as analytics evidence.
- Do not infer streaks or weekly history from `learning_plans.updated_at`,
  `task_progress.completed_at`, plan timestamps, or dashboard activity items.
- Do not backfill full historical study sessions from data that was never
  recorded.
- Reuse existing completion projections for current-state completion metrics
  instead of creating a parallel completion model.
- Keep operational telemetry, billing usage metrics, and user-facing learning
  analytics separate.

## Relevant Code Surfaces

- `/analytics/usage` page loader:
  `src/app/(app)/analytics/usage/page.tsx`
- Chart / content UI:
  `src/app/(app)/analytics/usage/usage-analytics-content.tsx`
- Historical model (streaks, weeks, trends):
  `src/app/(app)/analytics/usage/usage-analytics-model.ts`
- Browser timezone sync:
  `src/app/(app)/analytics/usage/usage-analytics-timezone-sync.tsx`
- Timezone update action:
  `src/app/(app)/analytics/usage/actions.ts`
- Completion calculations:
  `src/features/plans/read-projection/completion-metrics.ts`
- Plan summary projection:
  `src/features/plans/read-projection/summary-projection.ts`
- Activity event schema + trigger:
  `supabase/schema/tables/tasks.ts` (`learning_activity_events`)
- Activity event reads:
  `src/lib/db/queries/tasks.ts` (`getLearningActivityEventsForUser`)
- Analytics timezone storage:
  `supabase/schema/tables/user-preferences.ts` (`analytics_timezone`)
- Preference upserts:
  `src/lib/db/queries/user-preferences.ts`
