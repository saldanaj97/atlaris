/**
 * Factory for creating a fully-wired PlanLifecycleService instance.
 *
 * Wires the QuotaAdapter and PlanPersistenceAdapter automatically.
 * Remaining ports (PdfOrigin, Generation, UsageRecording, JobQueue)
 * must be provided by the caller — their adapters will be added in
 * subsequent issues (#238, #239).
 */

import type { DbClient } from '@/lib/db/types';

import { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';
import { QuotaAdapter } from './adapters/quota-adapter';
import type {
  GenerationPort,
  JobQueuePort,
  PdfOriginPort,
  UsageRecordingPort,
} from './ports';
import { PlanLifecycleService } from './service';

export function createPlanLifecycleService(params: {
  dbClient: DbClient;
  pdfOrigin: PdfOriginPort;
  generation: GenerationPort;
  usageRecording: UsageRecordingPort;
  jobQueue: JobQueuePort;
}): PlanLifecycleService {
  return new PlanLifecycleService({
    planPersistence: new PlanPersistenceAdapter(params.dbClient),
    quota: new QuotaAdapter(params.dbClient),
    pdfOrigin: params.pdfOrigin,
    generation: params.generation,
    usageRecording: params.usageRecording,
    jobQueue: params.jobQueue,
  });
}
