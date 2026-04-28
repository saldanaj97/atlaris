/**
 * Canonical plan read projection for app + API. Owns list/detail/
 * status/attempt orchestration, pure projections, and shared display-status
 * selection. Raw queries stay in `src/lib/db/queries/plans.ts`.
 */
export {
  derivePlanSummaryDisplayStatus,
  isPlanSummaryFullyComplete,
} from '@/features/plans/read-projection/selectors';
export {
  getPlanDetailForRead,
  getPlanGenerationAttemptsForRead,
  getPlanGenerationStatusSnapshot,
  getPlanListTotalCount,
  listDashboardPlanSummaries,
  listLightweightPlansForApi,
  listPlansPageSummaries,
  type PlanDbClient,
} from '@/features/plans/read-projection/service';
