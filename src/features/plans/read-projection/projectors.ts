/**
 * Pure projection helpers (summary/detail/attempt/status). See `service.ts` for orchestration.
 */
export {
	accumulateLightweightModuleMetricsRowInPlace,
	computeCompletionMetricsFromNestedModules,
	computeTaskRowCompletionMetrics,
	countCompletedModulesFromFlatTasks,
} from '@/features/plans/read-projection/completion-metrics';
export { buildLearningPlanDetail } from '@/features/plans/read-projection/detail-aggregate';
export {
	toClientGenerationAttempts,
	toClientPlanDetail,
} from '@/features/plans/read-projection/detail-dto';
export {
	buildPlanDetailStatusSnapshot,
	type PlanDetailStatusSnapshot,
} from '@/features/plans/read-projection/detail-status';
export {
	derivePlanReadStatus,
	derivePlanSummaryStatus,
	type PlanSummaryReadStatus,
} from '@/features/plans/read-projection/read-status';
export {
	buildLightweightPlanSummaries,
	buildPlanSummaries,
	deriveCanonicalPlanSummaryStatus,
} from '@/features/plans/read-projection/summary-projection';
