import type { ResourceCandidate } from '@/lib/curation/types';
import { resources } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import type { InferInsertModel } from 'drizzle-orm';

export type ResourcesDbClient = DbClient;

export type ResourceInsertValue = Pick<
  InferInsertModel<typeof resources>,
  'type' | 'title' | 'url' | 'domain' | 'durationMinutes'
>;

/**
 * Represents a ResourceInsertValue that has been validated, sanitized, and transformed
 * from a raw ResourceCandidate. Used to distinguish between arbitrary insert values
 * and values that have gone through the preparation pipeline.
 */
export type PreparedResourceCandidate = ResourceInsertValue;

export interface UpsertResourceParams {
  candidate: ResourceCandidate;
  dbClient: ResourcesDbClient;
}

export interface AttachTaskResourcesParams {
  taskId: string;
  resourceIds: string[];
  dbClient: ResourcesDbClient;
}

export interface UpsertAndAttachParams {
  taskId: string;
  candidates: ResourceCandidate[];
  dbClient: ResourcesDbClient;
}

export interface AttachTaskResourcesInternalParams {
  taskId: string;
  resourceIds: string[];
}
