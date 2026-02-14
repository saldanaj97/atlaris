import { generationAttempts, learningPlans } from '@/lib/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

/**
 * Db client for attempts. Must be request-scoped {@link getDb} in API routes to enforce RLS.
 *
 * When using the RLS client returned by {@link getDb}, callers are responsible for releasing
 * it by calling its `cleanup()` method. Do this in a `finally` block.
 */
export type AttemptsDbClient = ReturnType<
  typeof import('@/lib/db/runtime').getDb
>;

/** Drizzle-like methods required by attempt operations (reserve, finalize). */
const ATTEMPTS_DB_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'transaction',
] as const;

/**
 * Type guard for AttemptsDbClient. Use when accepting db from unknown (e.g. options bags)
 * to fail fast with a clear error instead of obscure Drizzle errors later.
 */
export function isAttemptsDbClient(db: unknown): db is AttemptsDbClient {
  if (db == null || typeof db !== 'object') {
    return false;
  }
  const obj = db as Record<string, unknown>;
  return ATTEMPTS_DB_METHODS.every(
    (method) => typeof obj[method] === 'function'
  );
}

export type GenerationAttemptRecord = InferSelectModel<
  typeof generationAttempts
>;

export interface AttemptReservation {
  reserved: true;
  attemptId: string;
  attemptNumber: number;
  startedAt: Date;
  sanitized: {
    topic: {
      value: string;
      truncated: boolean;
      originalLength: number;
    };
    notes: {
      value: string | undefined;
      truncated: boolean;
      originalLength?: number;
    };
  };
  promptHash: string;
  pdfProvenance?: {
    extractionHash: string;
    proofVersion: 1;
    contextDigest: string;
  } | null;
}

export interface AttemptRejection {
  reserved: false;
  reason: 'capped' | 'in_progress' | 'invalid_status' | 'rate_limited';
  currentStatus?: (typeof learningPlans.$inferSelect)['generationStatus'];
  retryAfter?: number;
}

export type ReserveAttemptResult = AttemptReservation | AttemptRejection;
