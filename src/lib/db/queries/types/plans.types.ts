import type { GenerationAttemptStatus } from '@/lib/db/enums';
import type { GenerationStatus } from '@/shared/types/db.types';

/**
 * Valid status values for a generation attempt record.
 * Used by the generation_attempts table status column.
 */
/**
 * Valid status values for a generation attempt record.
 * Used by the generation_attempts table status column.
 */
export type { GenerationAttemptStatus };

/** Plan metadata returned with generation attempts for display/context. */
export interface PlanAttemptsPlanMeta {
  id: string;
  topic: string;
  generationStatus: GenerationStatus;
}
