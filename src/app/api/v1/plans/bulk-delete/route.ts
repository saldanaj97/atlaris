import { PLAN_LIST_PAGE_SIZE } from '@/features/plans/read-projection/types';
import {
  removePlansForWrite,
  type BulkRemovePlanResult,
} from '@/features/plans/write-service';
import { ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BulkDeleteRequestBody = {
  planIds?: unknown;
};

type BulkDeleteResponse = {
  success: boolean;
  deletedCount: number;
  failedCount: number;
  results: BulkRemovePlanResult[];
};

function parseBulkDeletePlanIds(body: BulkDeleteRequestBody): string[] {
  if (!body || typeof body !== 'object' || !Array.isArray(body.planIds)) {
    throw new ValidationError('Invalid bulk delete request.', {
      planIds: 'planIds must be an array.',
    });
  }

  const dedupedPlanIds = [...new Set(body.planIds)];

  if (dedupedPlanIds.length === 0) {
    throw new ValidationError('Invalid bulk delete request.', {
      planIds: 'At least one plan ID is required.',
    });
  }

  if (dedupedPlanIds.length > PLAN_LIST_PAGE_SIZE) {
    throw new ValidationError('Invalid bulk delete request.', {
      planIds: `No more than ${PLAN_LIST_PAGE_SIZE} plan IDs are allowed.`,
    });
  }

  const invalidIds = dedupedPlanIds.filter(
    (planId) => typeof planId !== 'string' || !UUID_REGEX.test(planId),
  );

  if (invalidIds.length > 0) {
    throw new ValidationError('Invalid bulk delete request.', {
      planIds: 'Every plan ID must be a valid UUID.',
    });
  }

  return dedupedPlanIds as string[];
}

/**
 * POST /api/v1/plans/bulk-delete
 * Deletes up to one page of user-owned plans and returns per-plan results.
 */
export const POST = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, actor }) => {
    const body = (await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid bulk delete request.', {
          body: 'Request body must be valid JSON.',
        }),
    })) as BulkDeleteRequestBody;
    const planIds = parseBulkDeletePlanIds(body);

    logger.info(
      { userId: actor.id, planCount: planIds.length },
      'Bulk deleting learning plans',
    );

    const results = await removePlansForWrite({
      planIds,
      userId: actor.id,
    });

    const deletedCount = results.filter((result) => result.success).length;
    const failedCount = results.length - deletedCount;

    logger.info(
      {
        userId: actor.id,
        deletedCount,
        failedCount,
      },
      'Bulk learning plan deletion completed',
    );

    const response: BulkDeleteResponse = {
      success: deletedCount > 0,
      deletedCount,
      failedCount,
      results,
    };

    return json(response);
  },
);
