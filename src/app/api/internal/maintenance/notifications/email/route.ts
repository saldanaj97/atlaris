import type { EmailSender } from '@/features/notifications/email/types';
import type { Logger } from '@/lib/logging/logger';

import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import { createConfiguredEmailSender } from '@/features/notifications/email/factory';
import { emailNotificationDelivery } from '@/flags';
import { ServiceUnavailableError, ValidationError } from '@/lib/api/errors';
import { createMaintenancePostRoute } from '@/lib/api/internal/maintenance-route';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { json } from '@/lib/api/response';
import { emailNotificationCategory } from '@supabase/enums';
import { z } from 'zod';

const emailDeliveryBodySchema = z.strictObject({
  categories: z
    .array(z.enum(emailNotificationCategory.enumValues))
    .min(1)
    .max(3),
  schedulerDateUtc: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'schedulerDateUtc must be YYYY-MM-DD'),
  batchSize: z.number().int().positive().max(200).optional(),
  cursorUserId: z.string().uuid().nullable().optional(),
});

const EMAIL_DELIVERY_MONITOR_SLUG = 'email-notification-delivery';
const EMAIL_DELIVERY_MONITOR_CONFIG = {
  schedule: {
    type: 'crontab' as const,
    value: '0 14 * * *',
  },
  checkinMargin: 60,
  maxRuntime: 30,
  timezone: 'UTC',
};

const DISABLED_RESULT = {
  ok: true as const,
  outcome: 'disabled' as const,
  examined: 0,
  claimed: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  alreadyTerminal: 0,
  inFlight: 0,
  manualReview: 0,
  nextCursor: null,
};

export type EmailNotificationDeliveryRouteDeps = {
  resolveDeliveryEnabled?: () => Promise<boolean>;
  createSender?: () => EmailSender;
  runDelivery?: typeof runEmailNotificationDelivery;
};

async function resolveEmailDeliveryFlag(): Promise<boolean> {
  try {
    return Boolean(await emailNotificationDelivery());
  } catch {
    // Fail closed: evaluation failure must not enable sends.
    return false;
  }
}

export function createEmailNotificationDeliveryPostRoute(
  deps: EmailNotificationDeliveryRouteDeps = {},
) {
  const resolveDeliveryEnabled =
    deps.resolveDeliveryEnabled ?? resolveEmailDeliveryFlag;
  const createSender = deps.createSender ?? createConfiguredEmailSender;
  const runDelivery = deps.runDelivery ?? runEmailNotificationDelivery;

  return createMaintenancePostRoute({
    unavailableMessage: 'Email notification delivery is currently unavailable.',
    unauthorizedLogMessage:
      'Unauthorized email notification delivery trigger attempt',
    monitor: {
      slug: EMAIL_DELIVERY_MONITOR_SLUG,
      config: EMAIL_DELIVERY_MONITOR_CONFIG,
    },
    run: async ({ request, logger }) => {
      const body = await parseJsonBody(request, {
        mode: 'required',
        onMalformedJson: () =>
          new ValidationError('Invalid JSON in request body'),
      });
      const parsed = emailDeliveryBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid email notification delivery request',
          z.flattenError(parsed.error),
        );
      }

      let enabled = false;
      try {
        enabled = Boolean(await resolveDeliveryEnabled());
      } catch {
        // Fail closed: evaluation failure must not enable sends.
        enabled = false;
      }
      if (!enabled) {
        return json(DISABLED_RESULT);
      }

      const result = await runDelivery(parsed.data, {
        sender: createSender(),
        logger,
      });

      logger.info(
        {
          source: 'email_notifications',
          event: 'delivery_route_complete',
          ...result,
        },
        'Email notification delivery route complete',
      );

      if (result.failed > 0 || result.manualReview > 0) {
        // Must throw inside withMonitor so Sentry records an errored check-in.
        throw new ServiceUnavailableError(
          'Email notification delivery completed with unresolved failures.',
          {
            failed: result.failed,
            manualReview: result.manualReview,
          },
        );
      }

      return json({ ok: true, outcome: 'delivered' as const, ...result });
    },
  });
}

export const POST = createEmailNotificationDeliveryPostRoute();

export type { Logger };
