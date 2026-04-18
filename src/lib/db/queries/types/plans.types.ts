import type { GenerationStatus } from '@/shared/types/db.types';

/** Plan metadata returned with generation attempts for display/context. */
export interface PlanAttemptsPlanMeta {
  id: string;
  topic: string;
  generationStatus: GenerationStatus;
}
