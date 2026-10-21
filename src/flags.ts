import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { Adapter } from 'flags';

import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

const fallbackAdapter = (): Adapter<boolean, unknown> => ({
  decide: ({ defaultValue }) =>
    typeof defaultValue === 'boolean' ? defaultValue : false,
});

const tierListFallbackAdapter = (): Adapter<SubscriptionTier[], unknown> => ({
  decide: () => [],
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
 * Pre-launch gate: marketing pages stay live, app and auth routes go to /waitlist.
 * No defaultValue: evaluation errors throw so the site gate falls back to LAUNCH_WAITLIST.
 */
export const launchWaitlist = flag<boolean>({
  key: 'launch-waitlist',
  adapter: process.env.FLAGS ? vercelAdapter() : fallbackAdapter(),
  description:
    'Send app and auth traffic to the launch waitlist page before launch.',
  options: [
    { value: false, label: 'Launched' },
    { value: true, label: 'Waitlist' },
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

/**
 * Durable operational kill switch for module lesson generation (sync + workflow).
 * Fail-closed: missing/unavailable evaluation must not start generation.
 */
export const moduleLessonGeneration = flag<boolean>({
  key: 'module-lesson-generation',
  defaultValue: false,
  adapter: process.env.FLAGS ? vercelAdapter() : fallbackAdapter(),
  description:
    'Allow synchronous and workflow-backed module lesson generation.',
  options: [
    { value: false, label: 'Disabled' },
    { value: true, label: 'Enabled' },
  ],
});

/**
 * Tiers that run the grounded generation pipeline (research, verify, advisor).
 * Fail-closed: the default and any evaluation error mean no tier.
 */
export const groundedGeneration = flag<SubscriptionTier[]>({
  key: 'grounded-generation',
  defaultValue: [],
  adapter: process.env.FLAGS ? vercelAdapter() : tierListFallbackAdapter(),
  description:
    'Tiers that run grounded generation instead of the current pipeline.',
  options: [
    { value: [], label: 'Off' },
    { value: ['free'], label: 'Free' },
    { value: ['starter'], label: 'Starter' },
    { value: ['pro'], label: 'Pro' },
    { value: ['free', 'starter'], label: 'Free and Starter' },
    { value: ['free', 'pro'], label: 'Free and Pro' },
    { value: ['starter', 'pro'], label: 'Starter and Pro' },
    { value: ['free', 'starter', 'pro'], label: 'All tiers' },
  ],
});
