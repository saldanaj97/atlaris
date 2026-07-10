import { resolveEmailNotificationDeliveryEnabled } from '@/features/notifications/email/delivery-flag';
import { startEmailNotificationDeliveryWorkflow } from '@/features/notifications/email/start-email-notification-delivery-workflow';
import { resolveEmailNotificationDeliveryRunKind } from '@/features/notifications/email/workflows/email-notification-delivery.types';
import { tokensMatch } from '@/lib/api/internal/internal-worker-token';
import { json, jsonError } from '@/lib/api/response';
import { maintenanceEnv } from '@/lib/config/env';
import { EnvValidationError } from '@/lib/config/env/shared';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

function resolveCronSecret(): string | undefined {
  try {
    return maintenanceEnv.cronSecret;
  } catch (error) {
    if (error instanceof EnvValidationError && error.envKey === 'CRON_SECRET') {
      return undefined;
    }
    throw error;
  }
}

function readBearerToken(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type EmailNotificationDeliveryCronRouteDeps = {
  readonly resolveCronSecret?: () => string | undefined;
  readonly resolveDeliveryEnabled?: () => Promise<boolean>;
  readonly startWorkflow?: typeof startEmailNotificationDeliveryWorkflow;
  readonly now?: () => Date;
};

/**
 * Vercel Cron trigger. It only authenticates, maps the fixed schedule, and
 * starts/reuses a durable workflow; recipient work never runs in this request.
 */
export function createEmailNotificationDeliveryCronRoute(
  deps: EmailNotificationDeliveryCronRouteDeps = {},
) {
  const getCronSecret = deps.resolveCronSecret ?? resolveCronSecret;
  const resolveDeliveryEnabled =
    deps.resolveDeliveryEnabled ?? resolveEmailNotificationDeliveryEnabled;
  const startWorkflow =
    deps.startWorkflow ?? startEmailNotificationDeliveryWorkflow;
  const now = deps.now ?? (() => new Date());

  return async function GET(request: Request): Promise<Response> {
    const { logger } = getLoggingRequestContext(request);
    const expectedSecret = getCronSecret();
    const providedSecret = readBearerToken(request);
    if (!expectedSecret) {
      logger.error(
        {
          source: 'email_notifications',
          event: 'cron_secret_missing',
        },
        'Email notification cron secret is not configured',
      );
      return jsonError('Email notification cron is unavailable.', {
        status: 503,
      });
    }
    if (!providedSecret || !tokensMatch(expectedSecret, providedSecret)) {
      logger.warn(
        {
          source: 'email_notifications',
          event: 'cron_unauthorized',
          hasToken: Boolean(providedSecret),
        },
        'Unauthorized email notification cron trigger attempt',
      );
      return jsonError('Unauthorized cron trigger.', { status: 401 });
    }

    const schedule = request.headers.get('x-vercel-cron-schedule');
    const runKind = schedule
      ? resolveEmailNotificationDeliveryRunKind(schedule)
      : null;
    if (!runKind) {
      return jsonError('Unknown email notification cron schedule.', {
        status: 400,
      });
    }

    if (!(await resolveDeliveryEnabled())) {
      return json({ ok: true, outcome: 'disabled' as const });
    }

    const schedulerDateUtc = now().toISOString().slice(0, 10);
    const result = await startWorkflow({
      runKind,
      schedulerDateUtc,
      action: 'start',
    });
    logger.info(
      {
        source: 'email_notifications',
        event: 'cron_triggered',
        runKind,
        schedulerDateUtc,
        runId: result.runId,
        workflowRunId: result.workflowRunId,
        outcome: result.outcome,
      },
      'Email notification cron trigger completed',
    );

    return json(
      { ok: true, ...result },
      { status: result.outcome === 'started' ? 202 : 200 },
    );
  };
}

export const GET = createEmailNotificationDeliveryCronRoute();
