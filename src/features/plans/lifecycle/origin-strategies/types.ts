import type {
  PdfOriginPort,
  PlanPersistencePort,
} from '@/features/plans/lifecycle/ports';

/**
 * Narrow persistence dependencies shared by all plan-origin strategies.
 * Keep these ports small so strategy modules cannot reach unrelated lifecycle concerns.
 */
export type PlanCreationStrategyPorts = {
  planPersistence: Pick<
    PlanPersistencePort,
    'atomicInsertPlan' | 'findRecentDuplicatePlan'
  >;
};

/**
 * Additional PDF-specific boundary for proof verification and quota rollback.
 */
export type PdfPlanCreationStrategyPorts = PlanCreationStrategyPorts & {
  pdfOrigin: Pick<PdfOriginPort, 'preparePlanInput' | 'rollbackPdfUsage'>;
};
