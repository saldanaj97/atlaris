/**
 * Test factories for generation_attempts records.
 * Use these instead of direct db.insert calls to centralize schema changes.
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { PLAN_GENERATION_LIMIT } from '@/lib/ai/generation-policy';
import { generationAttempts } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

export type CreateFailedAttemptParams = {
  planId: string;
  classification?: string;
  durationMs?: number;
} & Partial<Omit<InferInsertModel<typeof generationAttempts>, 'planId'>>;

type GenerationAttemptRow = InferSelectModel<typeof generationAttempts>;

const FailedAttemptDefaults = {
  status: 'failure' as const,
  modulesCount: 0,
  tasksCount: 0,
  truncatedTopic: false,
  truncatedNotes: false,
  normalizedEffort: false,
  promptHash: null,
  metadata: null,
};

/**
 * Builds a failed generation attempt record for DB insertion.
 * Centralizes defaults so schema changes are reflected in one place.
 */
export function createFailedAttempt(
  overrides: CreateFailedAttemptParams
): InferInsertModel<typeof generationAttempts> {
  const {
    planId,
    classification = 'timeout',
    durationMs = 10_000,
    ...rest
  } = overrides;
  return {
    ...FailedAttemptDefaults,
    planId,
    classification,
    durationMs,
    ...rest,
  };
}

/**
 * Builds N failed attempts for a plan. Use for seeding cap-boundary tests.
 * Each attempt gets overrides via the builder; defaults are applied per record.
 */
export function createFailedAttempts(
  planId: string,
  count: number,
  overridesPerIndex?: (index: number) => Partial<CreateFailedAttemptParams>
): InferInsertModel<typeof generationAttempts>[] {
  return Array.from({ length: count }, (_, index) => {
    const base: CreateFailedAttemptParams = {
      planId,
      classification: index % 2 === 0 ? 'timeout' : 'validation',
      durationMs: 1_000 + index * 100,
    };
    const perIndex = overridesPerIndex?.(index) ?? {};
    return createFailedAttempt({ ...base, ...perIndex });
  });
}

/**
 * Inserts N failed attempts for a plan and returns created rows.
 * Use this in integration tests to avoid direct table inserts.
 */
export async function createFailedAttemptsInDb(
  planId: string,
  count: number,
  overridesPerIndex?: (index: number) => Partial<CreateFailedAttemptParams>
): Promise<GenerationAttemptRow[]> {
  const attempts = createFailedAttempts(planId, count, overridesPerIndex);
  const inserted = await db
    .insert(generationAttempts)
    .values(attempts)
    .returning();

  if (inserted.length !== count) {
    throw new Error(
      `Failed to create expected failed attempts: expected ${count}, got ${inserted.length}`
    );
  }

  return inserted;
}

/**
 * Returns how many attempts should be seeded to occupy the durable window while
 * leaving the requested number of slots available.
 */
export function getDurableWindowSeedCount(slotsRemaining = 0): number {
  const normalizedSlotsRemaining = Math.max(0, Math.floor(slotsRemaining));
  return Math.max(0, PLAN_GENERATION_LIMIT - normalizedSlotsRemaining);
}

type SeedFailedAttemptsForDurableWindowOptions = {
  slotsRemaining?: number;
  classification?: string;
  durationMs?: number;
  promptHashPrefix?: string;
  metadata?: CreateFailedAttemptParams['metadata'];
};

/**
 * Seeds failed attempts for a single plan to simulate durable-window saturation.
 */
export async function seedFailedAttemptsForDurableWindow(
  planId: string,
  options: SeedFailedAttemptsForDurableWindowOptions = {}
): Promise<GenerationAttemptRow[]> {
  const {
    slotsRemaining = 0,
    classification = 'timeout',
    durationMs = 1_000,
    promptHashPrefix = 'durable-window-seed',
    metadata = null,
  } = options;
  const count = getDurableWindowSeedCount(slotsRemaining);
  return createFailedAttemptsInDb(planId, count, (index) => ({
    classification,
    durationMs,
    promptHash: `${promptHashPrefix}-${index}`,
    metadata,
  }));
}
