import type { PlanLifecyclePersistence } from '@/features/plans/lifecycle/service';

/**
 * Narrow persistence dependencies shared by all plan-origin strategies.
 * Keep these ports small so strategy modules cannot reach unrelated lifecycle concerns.
 */
export type PlanCreationStrategyPorts = {
  planPersistence: Pick<PlanLifecyclePersistence, 'atomicInsertPlan'>;
};
