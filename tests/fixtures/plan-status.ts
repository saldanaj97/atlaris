import type { PlanStatus } from '@/lib/types/client';

export interface PlanStatusResponseData {
  planId: string;
  status: PlanStatus;
  attempts: number;
  latestError: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Creates a plan-status API response payload, merging in any overrides.
 * Defaults to a minimal pending response for plan-123.
 */
export function createPlanStatusResponse(
  overrides?: Partial<PlanStatusResponseData>
): PlanStatusResponseData {
  return {
    planId: 'plan-123',
    status: 'pending',
    attempts: 1,
    latestError: null,
    ...overrides,
  };
}

/**
 * Wraps a data payload in a simulated successful fetch Response shape
 * (i.e. { ok: true, json: async () => data }).
 */
export function createMockFetchResponse(data: PlanStatusResponseData): {
  ok: true;
  json: () => Promise<PlanStatusResponseData>;
} {
  return {
    ok: true,
    json: async () => data,
  };
}
