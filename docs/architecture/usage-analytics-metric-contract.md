# Usage Analytics Metric Contract

This contract defines what user-facing usage analytics may promise from current
completion state and append-only learning activity history.

## Shipped surface

`/analytics/usage` is live. It shows:

- Current-state completion analytics and estimated completed learning time
- Historical streaks, weekly summaries, and trends from recorded
  `learning_activity_events`

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
| `streaks` | `learning_activity_events` | Historical | Count local study days from recorded progress-change activity. Current streak may continue through yesterday when today has no activity yet. |
| `weekly_summaries` | `learning_activity_events` | Historical | Summarize recorded progress-change activity in Monday-start learning weeks. |
| `trends` | `learning_activity_events` | Historical | Show recent weekly progress-change and completed-event history from recorded events only (8-week window in the UI model). |

## Activity semantics

- A study day is any calendar day with at least one recorded task progress
  status change.
- Activity history is forward-only from the activity-history launch date.
- `learning_activity_events` records task progress status changes at the
  database boundary. Rows are deleted if their user, plan, module, or task is
  deleted.
- Do not reconstruct complete pre-launch history from mutable current-state
  rows.
- Streaks support both global and per-plan views.
- Date bucketing uses `user_preferences.analytics_timezone`. New and existing
  users default to `UTC`; `/analytics/usage` may update the setting from the
  browser's IANA timezone after authenticated render via
  `UsageAnalyticsTimezoneSync`.

## Guardrails

- Do not use synthetic dashboard activity from
  `src/app/(app)/dashboard/components/activity-utils.ts` as analytics evidence.
- Do not infer streaks or weekly history from `learning_plans.updated_at`,
  `task_progress.completed_at`, plan timestamps, or dashboard activity items.
- Do not backfill full historical study sessions from data that was never
  recorded.
- Reuse existing completion projections instead of creating a parallel
  completion model.
- Keep operational telemetry, billing usage metrics, and user-facing learning
  analytics separate.

## Relevant code surfaces

| Concern | Location |
| --- | --- |
| Page / auth boundary | `src/app/(app)/analytics/usage/page.tsx` |
| UI model builder | `src/app/(app)/analytics/usage/usage-analytics-model.ts` |
| Charts / content | `src/app/(app)/analytics/usage/usage-analytics-content.tsx` |
| Timezone sync client | `src/app/(app)/analytics/usage/usage-analytics-timezone-sync.tsx` |
| Plan summaries | `listUsageAnalyticsPlanSummaries` in `src/features/plans/read-projection/service.ts` |
| Activity history query | `getLearningActivityEventsForUser` in `src/lib/db/queries/tasks.ts` |
| Completion projections | `src/features/plans/read-projection/completion-metrics.ts` |
| Activity table | `learning_activity_events` in `supabase/schema/tables/tasks.ts` |
| Analytics timezone | `user_preferences.analytics_timezone` in `supabase/schema/tables/user-preferences.ts` |
| Timezone helpers | `src/shared/analytics/learning-activity-time.ts` |

## Historical issue boundaries

These slices shipped the feature; keep the contract even though the tickets are closed:

- JCS-26: completion analytics and estimated completed learning time from
  current-state projections.
- JCS-27: append-only `learning_activity_events`.
- JCS-28: streaks, weekly summaries, and trends from recorded activity history
  and the stored analytics timezone.
