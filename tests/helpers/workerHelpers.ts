import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { JOB_TYPES } from '@/lib/jobs/types';
import { GenerationService } from '@/workers/services/generation-service';
import { CurationService } from '@/workers/services/curation-service';
import { PersistenceService } from '@/workers/services/persistence-service';
import { PlanGenerationHandler } from '@/workers/handlers/plan-generation-handler';
import { PlanRegenerationHandler } from '@/workers/handlers/plan-regeneration-handler';
import type { PlanGenerationWorkerOptions } from '@/workers/plan-generator';

/**
 * Creates a handler map for the worker with default wiring of services.
 * This matches the production wiring in src/workers/index.ts
 */
export function createDefaultHandlers(): PlanGenerationWorkerOptions['handlers'] {
  const provider = getGenerationProvider();
  const generationService = new GenerationService(provider);
  const curationService = new CurationService(provider);
  const persistenceService = new PersistenceService();

  const planGenerationHandler = new PlanGenerationHandler(
    generationService,
    curationService,
    persistenceService
  );

  const planRegenerationHandler = new PlanRegenerationHandler(
    generationService,
    curationService,
    persistenceService
  );

  return {
    [JOB_TYPES.PLAN_GENERATION]: planGenerationHandler,
    [JOB_TYPES.PLAN_REGENERATION]: planRegenerationHandler,
  };
}
