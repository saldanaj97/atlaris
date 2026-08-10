import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

const fallbackAdapter = () => ({
  decide: ({ defaultValue }: { defaultValue?: boolean }) =>
    defaultValue ?? false,
});

export const maintenanceMode = flag<boolean>({
  key: 'maintenance-mode',
  adapter: process.env.FLAGS ? vercelAdapter() : fallbackAdapter(),
  description: 'Route all app traffic to the maintenance page.',
  options: [
    { value: false, label: 'Available' },
    { value: true, label: 'Maintenance mode' },
  ],
});

/**
 * Global environment-level kill switch for opted-in email notification delivery.
 * Fail-closed: missing/unavailable evaluation must not enable sends.
 */
export const emailNotificationDelivery = flag<boolean>({
  key: 'email-notification-delivery',
  defaultValue: false,
  adapter: process.env.FLAGS ? vercelAdapter() : fallbackAdapter(),
  description:
    'Allow the scheduled worker to send opted-in email notifications.',
  options: [
    { value: false, label: 'Disabled' },
    { value: true, label: 'Enabled' },
  ],
});
