/**
 * Factory for creating a fully-wired PlanLifecycleService instance.
 *
 * Wires the QuotaAdapter, PlanPersistenceAdapter, PdfOriginAdapter,
 * GenerationAdapter, and UsageRecordingAdapter automatically.
 * The JobQueue port must be provided by the caller.
 */

import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { DbClient } from '@/lib/db/types';

import { GenerationAdapter } from './adapters/generation-adapter';
import { PdfOriginAdapter } from './adapters/pdf-origin-adapter';
import { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';
import { QuotaAdapter } from './adapters/quota-adapter';
import { UsageRecordingAdapter } from './adapters/usage-recording-adapter';
import type { JobQueuePort } from './ports';
import { PlanLifecycleService } from './service';

export function createPlanLifecycleService(params: {
  dbClient: DbClient;
  attemptsDbClient: AttemptsDbClient;
  jobQueue: JobQueuePort;
}): PlanLifecycleService {
  return new PlanLifecycleService({
    planPersistence: new PlanPersistenceAdapter(params.dbClient),
    quota: new QuotaAdapter(params.dbClient),
    pdfOrigin: new PdfOriginAdapter(params.dbClient),
    generation: new GenerationAdapter(params.attemptsDbClient),
    usageRecording: new UsageRecordingAdapter(),
    jobQueue: params.jobQueue,
  });
}
