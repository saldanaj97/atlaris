import { selectFreeAccessPlan } from '@/features/plans/entitlement/store';
import { AppError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { revalidatePathsBestEffort } from '@/lib/next/revalidate-paths';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { z } from 'zod';

const selectFreeAccessPlanBodySchema = z.object({
  planId: z.uuid(),
});

export const POST = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, actor, db }) => {
    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body'),
      maxBytes: 16 * 1024,
    });
    const parsed = selectFreeAccessPlanBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid free-access plan payload',
        parsed.error.flatten(),
      );
    }

    const result = await selectFreeAccessPlan({
      userId: actor.id,
      planId: parsed.data.planId,
      dbClient: db,
    });

    switch (result.status) {
      case 'selected': {
        revalidatePathsBestEffort(['/plans', '/dashboard']);
        return json({
          planId: result.snapshot.freeAccessPlanId,
          selectedAt: result.snapshot.freeAccessPlanSelectedAt?.toISOString(),
        });
      }
      case 'already_selected': {
        if (result.snapshot.freeAccessPlanId === parsed.data.planId) {
          return json({
            planId: result.snapshot.freeAccessPlanId,
            selectedAt: result.snapshot.freeAccessPlanSelectedAt?.toISOString(),
          });
        }
        throw new AppError('Free plan selection is already complete.', {
          status: 409,
          code: 'CONFLICT',
          classification: 'conflict',
        });
      }
      case 'not_applicable':
        throw new ValidationError(
          'Free plan selection is not required for this account.',
        );
      case 'no_plan_available':
        throw new AppError('No Free plan is available to keep.', {
          status: API_ERROR_HTTP_STATUS.PLAN_ENTITLEMENT_REQUIRED,
          code: API_ERROR_CODES.PLAN_ENTITLEMENT_REQUIRED,
        });
      case 'invalid_candidate':
        throw new NotFoundError('Learning plan not found.');
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  },
);
