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
 * DB client scoping (server-owned writes):
 *   - Plan stream/retry sessions: service-role client for generation persistence
 *     after request auth and ownership checks at the route boundary
 *   - Workers: service-role client (same server-owned write boundary)
 *   - Reads and pre-write access checks: request-scoped RLS via getDb()
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
