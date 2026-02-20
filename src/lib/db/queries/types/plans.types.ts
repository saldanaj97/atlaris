import type { GenerationStatus } from '@/lib/types/db';

/**
 * Valid status values for a generation attempt record.
 * Used by the generation_attempts table status column.
 */
export type GenerationAttemptStatus = 'in_progress' | 'success' | 'failure';

/** Plan metadata returned with generation attempts for display/context. */
export interface PlanAttemptsPlanMeta {
  id: string;
  topic: string;
  generationStatus: GenerationStatus;
}
