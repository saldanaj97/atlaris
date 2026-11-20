// Plan-specific error classes
//
// Moved from features/billing/errors.ts — these errors represent plan domain
// operations (quota enforcement, creation failures), not billing infrastructure.

import { AppError } from '@/lib/api/errors';

export class PlanCreationError extends AppError {
  constructor(details?: Record<string, unknown>) {
    super('Failed to create plan.', {
      status: 500,
      code: 'PLAN_CREATION_FAILED',
      details,
    });
  }
}
