import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

export type RunPlanGenerationAfterReservationParams = {
  readonly input: ProcessGenerationInput;
  readonly reservation: AttemptReservation;
  readonly lifecycleService: PlanLifecycleService;
};

/**
 * Runs provider work and finalization after a successful attempt reservation.
 * Safe for workflow replay because it does not call `reserveAttemptSlot` again.
 */
export async function runPlanGenerationAfterReservation(
  params: RunPlanGenerationAfterReservationParams,
): Promise<GenerationAttemptResult> {
  return params.lifecycleService.processGenerationAttemptWithReservation(
    params.input,
    params.reservation,
  );
}
