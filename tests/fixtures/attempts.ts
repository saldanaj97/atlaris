/**
 * Test factories for generation_attempts records.
 * Use these instead of direct db.insert calls to centralize schema changes.
 */

import type { InferInsertModel } from 'drizzle-orm';

import { generationAttempts } from '@/lib/db/schema';

export type CreateFailedAttemptParams = {
  planId: string;
  classification?: string;
  durationMs?: number;
} & Partial<Omit<InferInsertModel<typeof generationAttempts>, 'planId'>>;

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
  const { planId, classification = 'timeout', durationMs = 10_000 } = overrides;
  return {
    ...FailedAttemptDefaults,
    planId,
    classification,
    durationMs,
    ...overrides,
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
