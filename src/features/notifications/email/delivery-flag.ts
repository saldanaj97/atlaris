import { emailNotificationDelivery } from '@/flags';

/** Fail closed when the Flagship flag cannot be evaluated. */
export async function resolveEmailNotificationDeliveryEnabled(): Promise<boolean> {
  try {
    return Boolean(await emailNotificationDelivery());
  } catch {
    return false;
  }
}
