import type { EmailSender } from './types';

import { createResendEmailSender } from './resend-adapter';
import { assertEmailDeliveryConfig, emailEnv } from '@/lib/config/env/email';

export function createConfiguredEmailSender(): EmailSender {
  assertEmailDeliveryConfig(emailEnv);
  return createResendEmailSender({
    apiKey: emailEnv.apiKey!,
    from: emailEnv.from!,
    replyTo: emailEnv.replyTo,
  });
}
