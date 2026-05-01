/**
 * Factory for creating a fully-wired PlanLifecycleService instance.
 *
 * Creates a PlanLifecycleService with all adapters wired to a single DB connection.
 *
 * Design: All lifecycle operations (plan creation, generation, generation finalization)
 * use the same database connection. This prevents the "closed connection" bug where
 * Connection 1 (request-scoped) was used for lifecycle operations after withAuth's
 * finally block closed it.
 *
 * Connection scoping:
 *   - Stream route: stream-scoped RLS connection (survives entire generation)
 *   - Retry route: request-scoped RLS connection (synchronous with request)
 *   - Workers: service-role connection (no RLS needed)
 */

import { GenerationAdapter } from './adapters/generation-adapter';
import { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';
import { QuotaAdapter } from './adapters/quota-adapter';
import { GenerationFinalizationAdapter } from './generation-finalization/adapter';
import { PlanLifecycleService } from './service';

import type { DbClient } from '@/lib/db/types';

export function createPlanLifecycleService(params: {
  dbClient: DbClient;
}): PlanLifecycleService {
  return new PlanLifecycleService({
    planPersistence: new PlanPersistenceAdapter(params.dbClient),
    quota: new QuotaAdapter(params.dbClient),
    generation: new GenerationAdapter(params.dbClient),
    generationFinalization: new GenerationFinalizationAdapter(params.dbClient),
  });
}
