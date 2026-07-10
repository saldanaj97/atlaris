import { runEmailNotificationDelivery } from '@/features/notifications/email/delivery-service';
import { createConfiguredEmailSender } from '@/features/notifications/email/factory';
import { ValidationError } from '@/lib/api/errors';
import { createMaintenancePostRoute } from '@/lib/api/internal/maintenance-route';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { json } from '@/lib/api/response';
import { maintenanceEnv } from '@/lib/config/env';
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
  maxRuntime: 10,
  timezone: 'UTC',
};

export const POST = createMaintenancePostRoute({
  enabled: () => maintenanceEnv.emailNotificationDeliveryEnabled,
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

    const result = await runEmailNotificationDelivery(parsed.data, {
      sender: createConfiguredEmailSender(),
      logger,
    });

    return json({ ok: true, ...result });
  },
});
