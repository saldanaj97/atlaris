import { emailNotificationDelivery } from '@/flags';

export async function resolveEmailNotificationDeliveryEnabled(): Promise<boolean> {
  try {
    return Boolean(await emailNotificationDelivery());
  } catch {
    return false;
  }
}
