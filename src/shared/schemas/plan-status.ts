import { z } from 'zod';
import { PLAN_STATUSES } from '@/shared/types/client';

/**
 * Wire contract for `GET /api/v1/plans/:planId/status`.
 *
 * Server route maps `PlanDetailStatusSnapshot.latestClassification` into a
 * user-facing `latestError` string (or `null`) before validating with this
 * schema. The client hook (`usePlanStatus`) parses incoming JSON with the
 * same schema, keeping both sides locked to one source of truth.
 */
export const PlanStatusResponseSchema = z.object({
  planId: z.string(),
  status: z.enum(PLAN_STATUSES),
  attempts: z.number(),
  latestError: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
