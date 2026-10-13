import {
  dispatchEmailDeliveryToWorker,
  type EmailDeliveryDispatchResult,
} from '@/features/jobs/email-delivery-dispatch';
import { resolveEmailNotificationDeliveryEnabled } from '@/features/notifications/email/delivery-flag';
import { isEmailNotificationDeliveryWeeklyDate } from '@/features/notifications/email/workflows/email-notification-delivery.types';
import {
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
} from '@/lib/api/errors';
import { createMaintenancePostRoute } from '@/lib/api/internal/maintenance-route';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { json } from '@/lib/api/response';
import { z } from 'zod';

const emailDeliveryBodySchema = z.strictObject({
  runKind: z.enum(['daily', 'weekly']),
  schedulerDateUtc: z.iso.date(),
  action: z.enum(['start', 'resume', 'replay_reviewed']),
});

const DISABLED_RESULT = { ok: true as const, outcome: 'disabled' as const };

export type EmailNotificationDeliveryRouteDeps = {
  readonly resolveDeliveryEnabled?: () => Promise<boolean>;
  readonly dispatch?: typeof dispatchEmailDeliveryToWorker;
  readonly now?: () => Date;
};

export function createEmailNotificationDeliveryPostRoute(
  deps: EmailNotificationDeliveryRouteDeps = {},
) {
  const resolveDeliveryEnabled =
    deps.resolveDeliveryEnabled ?? resolveEmailNotificationDeliveryEnabled;
  const dispatch = deps.dispatch ?? dispatchEmailDeliveryToWorker;
  const now = deps.now ?? (() => new Date());

  return createMaintenancePostRoute({
    // Keep route-token authentication ahead of body parsing and flag evaluation.
    enabled: () => true,
    unavailableMessage: 'Email notification delivery is currently unavailable.',
    unauthorizedLogMessage:
      'Unauthorized email notification delivery trigger attempt',
    run: async ({ request, logger }) => {
      const body = await parseJsonBody(request, {
        mode: 'required',
        onMalformedJson: () =>
          new ValidationError('Invalid JSON in request body'),
        maxBytes: 256 * 1024,
      });
      const parsed = emailDeliveryBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid email notification delivery request',
          z.flattenError(parsed.error),
        );
      }
      if (
        parsed.data.runKind === 'weekly' &&
        !isEmailNotificationDeliveryWeeklyDate(parsed.data.schedulerDateUtc)
      ) {
        throw new ValidationError(
          'Weekly email notification delivery requires a Monday UTC date.',
        );
      }
      if (
        parsed.data.action === 'start' &&
        parsed.data.schedulerDateUtc > now().toISOString().slice(0, 10)
      ) {
        throw new ValidationError(
          'New email notification delivery runs cannot use a future UTC date.',
        );
      }

      let enabled = false;
      try {
        enabled = await resolveDeliveryEnabled();
      } catch {
        enabled = false;
      }
      if (!enabled) {
        return json(DISABLED_RESULT);
      }

      const dispatched: EmailDeliveryDispatchResult = await dispatch(
        parsed.data,
      );
      switch (dispatched.kind) {
        case 'accepted':
          break;
        case 'invalid_run_state':
          throw new ConflictError(
            'Email delivery run action is not valid for its current state.',
          );
        case 'disabled':
          return json(DISABLED_RESULT);
        case 'failed':
          throw new ServiceUnavailableError(
            'Email notification workflow could not be started.',
          );
        default: {
          const _exhaustive: never = dispatched;
          return _exhaustive;
        }
      }
      if (dispatched.outcome === 'failed_requires_resume') {
        throw new ServiceUnavailableError(
          'Email notification workflow could not be started.',
        );
      }
      const result = {
        outcome: dispatched.outcome,
        runId: dispatched.runId,
        workflowRunId: dispatched.instanceId,
      };
      logger.info(
        {
          source: 'email_notifications',
          event: 'manual_triggered',
          runKind: parsed.data.runKind,
          schedulerDateUtc: parsed.data.schedulerDateUtc,
          action: parsed.data.action,
          runId: result.runId,
          workflowRunId: result.workflowRunId,
          outcome: result.outcome,
        },
        'Email notification delivery manual trigger completed',
      );

      return json(
        { ok: true, ...result },
        { status: result.outcome === 'started' ? 202 : 200 },
      );
    },
  });
}

export const POST = createEmailNotificationDeliveryPostRoute();
