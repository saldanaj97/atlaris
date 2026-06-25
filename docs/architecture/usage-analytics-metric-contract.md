# Usage Analytics Metric Contract

This contract defines what the first user-facing usage analytics release may
promise, and what must wait for append-only learning activity history.

## First Release Boundary

The first `/analytics/usage` release may show completion analytics and clearly
labeled estimated completed learning time. It must not promise actual study
time, streaks, weekly summaries, or trends until Atlaris records durable
activity history.

Use this wording for the MVP time metric:

- Label: `Estimated completed learning time`
- Helper copy: `Based on estimates for tasks currently marked complete. This is not recorded study time.`
- Historical placeholder copy: `Streaks and weekly summaries start after activity tracking launches.`

## Metric Glossary

| Metric | Source of truth | Classification | Contract |
| --- | --- | --- | --- |
| `task_completion` | `task_progress.status = 'completed'` | Current-state | A task is complete only while the user's latest progress row for that task is `completed`. |
| `module_completion` | Existing completion read projections over module tasks | Current-state | A module is complete only when it has at least one task and every task is currently complete. |
| `plan_completion` | Existing completion read projections over plan tasks | Current-state | `completedTasks / totalTasks`; plans with zero tasks have `0` completion. |
| `estimated_completed_learning_time` | `tasks.estimated_minutes` for currently completed tasks | Current-state, estimated | Sum task estimates for tasks currently marked complete. This is not actual recorded study time. |
| `actual_study_time` | Future append-only learning activity history | Historical, actual | Unavailable until explicit study-duration events or another accepted actual-time source exists. |
| `streaks` | Future append-only learning activity history | Historical | Unavailable until progress-change activity events exist and date bucketing is defined. |
| `weekly_summaries` | Future append-only learning activity history | Historical | Unavailable until post-launch activity events exist. |
| `trends` | Future append-only learning activity history | Historical | Unavailable until post-launch activity events exist. |

## Future Activity Semantics

JCS-27 must create the durable activity source before JCS-28 exposes historical
analytics.

- A study day is any calendar day with at least one recorded task progress
  status change.
- Activity history is forward-only from the activity-history launch date.
- Do not reconstruct complete pre-launch history from mutable current-state
  rows.
- Streaks should support both global and per-plan views when implemented.
- Date bucketing must not ship until the history implementation chooses a
  canonical timezone source. The current schema has schedule timezone data, but
  no general user timezone.

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

## Downstream Issue Boundaries

- JCS-26 may ship completion analytics and estimated completed learning time
  from existing current-state projections.
- JCS-27 must add append-only learning activity history before any historical
  analytics ship.
- JCS-28 may build streaks, weekly summaries, and trends only from recorded
  activity history.
