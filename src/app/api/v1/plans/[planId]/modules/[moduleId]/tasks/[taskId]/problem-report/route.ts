import type { PlainHandler } from '@/lib/api/auth';

import {
  requirePlanContentAccess,
  requireUuidRouteParam,
} from '@/features/plans/api/route-context';
import {
  lessonProblemReportErrorField,
  lessonProblemReportRequestSchema,
} from '@/features/plans/lesson-problem-reports/validation';
import { AppError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { upsertLessonProblemReport } from '@/lib/db/queries/lesson-problem-reports';
import { captureAfterResponse } from '@/lib/posthog-server';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';

const MAX_BODY_BYTES = 16 * 1024;

export const PUT: PlainHandler = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, params, actor, db }) => {
    const planId = requireUuidRouteParam(params, 'planId');
    const moduleId = requireUuidRouteParam(params, 'moduleId');
    const taskId = requireUuidRouteParam(params, 'taskId');

    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body.'),
      maxBytes: MAX_BODY_BYTES,
    });

    const parsed = lessonProblemReportRequestSchema.safeParse(body);
    if (!parsed.success) {
      const field = lessonProblemReportErrorField(parsed.error);
      throw new ValidationError(
        'Invalid lesson problem report.',
        field ? { field } : undefined,
      );
    }
    const { reason, note, lessonContentUpdatedAt } = parsed.data;

    await requirePlanContentAccess({
      planId,
      ownerUserId: actor.id,
      dbClient: db,
    });

    const result = await upsertLessonProblemReport(
      {
        userId: actor.id,
        planId,
        moduleId,
        taskId,
        reason,
        note,
        lessonContentUpdatedAt,
      },
      db,
    );

    switch (result.kind) {
      case 'not-found':
        throw new NotFoundError('Lesson not found.');
      case 'content-changed':
        throw new AppError('This lesson changed since it was opened.', {
          status: API_ERROR_HTTP_STATUS.LESSON_CONTENT_CHANGED,
          code: API_ERROR_CODES.LESSON_CONTENT_CHANGED,
          classification: 'conflict',
        });
      case 'saved':
        captureAfterResponse(actor, 'lesson_problem_reported', {
          plan_id: planId,
          module_id: moduleId,
          task_id: taskId,
          reason,
          has_note: note !== null,
        });
        return json({ id: result.reportId });
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  },
);
