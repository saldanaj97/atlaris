import type { ProviderMetadata } from '@/lib/ai/provider';
import type { ParsedModule } from '@/lib/ai/orchestrator';
import type {
  PlanGenerationJobData,
  PlanGenerationJobResult,
} from '@/lib/jobs/types';
import type { FailureClassification } from '@/lib/types/client';
import { logger } from '@/lib/logging/logger';

import { CurationService } from '../services/curation-service';

export function buildPlanGenerationJobResult({
  modules,
  durationMs,
  attemptId,
  providerMetadata,
}: {
  modules: ParsedModule[];
  durationMs: number;
  attemptId: string;
  providerMetadata?: ProviderMetadata;
}): PlanGenerationJobResult {
  const modulesCount = modules.length;
  const tasksCount = modules.reduce(
    (sum, module) => sum + module.tasks.length,
    0
  );

  return {
    modulesCount,
    tasksCount,
    durationMs,
    metadata: {
      provider: providerMetadata ?? null,
      attemptId,
    },
  };
}

type RunPlanJobCurationParams = {
  curationService: CurationService;
  planId: string;
  jobId: string;
  topic: PlanGenerationJobData['topic'];
  skillLevel: PlanGenerationJobData['skillLevel'];
  event: string;
};

export async function runPlanJobCuration({
  curationService,
  planId,
  jobId,
  topic,
  skillLevel,
  event,
}: RunPlanJobCurationParams) {
  if (!CurationService.shouldRunCuration()) {
    return;
  }

  const runCuration = () =>
    curationService
      .curateAndAttachResources({
        planId,
        topic,
        skillLevel,
      })
      .catch((curationError) => {
        logger.error(
          {
            planId,
            jobId,
            error: curationError,
            event,
          },
          'Curation failed during plan job'
        );
      });

  if (CurationService.shouldRunSync()) {
    await runCuration();
  } else {
    void runCuration();
  }
}

export const isRetryableClassification = (
  classification: FailureClassification | 'unknown'
) => classification !== 'validation' && classification !== 'capped';

export function formatGenerationError(
  error: unknown,
  fallback: string
): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string') {
    return error || fallback;
  }
  return fallback;
}
