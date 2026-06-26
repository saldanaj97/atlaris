# Usage Analytics Metric Contract

This contract defines what user-facing usage analytics may promise from current
completion state and append-only learning activity history.

## First Release Boundary

The first `/analytics/usage` release may show completion analytics and clearly
labeled estimated completed learning time. After JCS-27, historical analytics
may show streaks, weekly summaries, and trends only from recorded
`learning_activity_events`.

Use this wording for the MVP time metric:

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

## Future Activity Semantics

JCS-27 creates `learning_activity_events` as the durable activity source. JCS-28
exposes historical analytics from that source.

- A study day is any calendar day with at least one recorded task progress
  status change.
- Activity history is forward-only from the activity-history launch date.
- `learning_activity_events` records task progress status changes at the
  database boundary. Rows are deleted if their user, plan, module, or task is
  deleted.
- Do not reconstruct complete pre-launch history from mutable current-state
  rows.
- Streaks support both global and per-plan views.
- Date bucketing uses `users.analytics_timezone`. New and existing users default
  to `UTC`; `/analytics/usage` may update the setting from the browser's IANA
  timezone after authenticated render.

## Guardrails

- Do not use synthetic dashboard activity from
  `src/app/(app)/dashboard/components/activity-utils.ts` as analytics evidence.
- Do not infer streaks or weekly history from `learning_plans.updated_at`,
  `task_progress.completed_at`, plan timestamps, or dashboard activity items.
- Do not backfill full historical study sessions from data that was never
  recorded.
- Reuse existing completion projections for JCS-26 instead of creating a
  parallel completion model.
- Keep operational telemetry, billing usage metrics, and user-facing learning
  analytics separate.

## Relevant Code Surfaces

- `/analytics/usage` placeholder:
  `src/app/(app)/analytics/usage/page.tsx`
- Completion calculations:
  `src/features/plans/read-projection/completion-metrics.ts`
- Plan summary projection:
  `src/features/plans/read-projection/summary-projection.ts`
- Current task progress schema:
  `supabase/schema/tables/tasks.ts`
- Analytics timezone source:
  `supabase/schema/tables/users.ts`

## Downstream Issue Boundaries

- JCS-26 may ship completion analytics and estimated completed learning time
  from existing current-state projections.
- JCS-27 adds append-only learning activity history in
  `learning_activity_events`; no historical analytics ship in that slice.
- JCS-28 builds streaks, weekly summaries, and trends only from recorded
  activity history and the stored analytics timezone.
