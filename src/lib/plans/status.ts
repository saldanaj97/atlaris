import type { PlanStatus } from '@/lib/types/client';
import type { GenerationStatus } from '@/lib/types/db';

export function derivePlanStatus(params: {
  generationStatus: GenerationStatus;
  hasModules: boolean;
}): PlanStatus {
  const { generationStatus, hasModules } = params;

  if (generationStatus === 'ready' || hasModules) {
    return 'ready';
  }

  if (generationStatus === 'failed') {
    return 'failed';
  }

  if (generationStatus === 'generating') {
    return 'processing';
  }

  return 'pending';
}
