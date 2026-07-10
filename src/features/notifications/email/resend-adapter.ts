import type { EmailMessage, EmailSendResult, EmailSender } from './types';

import { EnvValidationError } from '@/lib/config/env/shared';
import { Resend } from 'resend';

export type ResendAdapterConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

export class EmailProviderError extends Error {
  readonly failureClass: string;

  constructor(message: string, failureClass: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmailProviderError';
    this.failureClass = failureClass;
  }
}

/**
 * Thin Resend sender. Never logs message bodies. Uses SDK idempotencyKey.
 */
export function createResendEmailSender(
  config: ResendAdapterConfig,
): EmailSender {
  if (!config.apiKey) {
    throw new EnvValidationError(
      'Missing required environment variable: RESEND_API_KEY',
      'RESEND_API_KEY',
    );
  }
  if (!config.from) {
    throw new EnvValidationError(
      'Missing required environment variable: RESEND_FROM',
      'RESEND_FROM',
    );
  }

  const client = new Resend(config.apiKey);

  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      try {
        const { data, error } = await client.emails.send(
          {
            from: config.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            headers: message.headers,
            ...(config.replyTo ? { replyTo: config.replyTo } : {}),
          },
          { idempotencyKey: message.idempotencyKey },
        );

        if (error) {
          throw new EmailProviderError(
            'Email provider rejected the send request.',
            classifyResendError(error),
          );
        }

        return { providerMessageId: data?.id ?? null };
      } catch (err) {
        if (err instanceof EmailProviderError) {
          throw err;
        }
        throw new EmailProviderError(
          'Email provider request failed.',
          'provider_error',
          { cause: err },
        );
      }
    },
  };
}

function classifyResendError(error: {
  message?: string;
  name?: string;
}): string {
  const haystack = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (haystack.includes('rate') || haystack.includes('429')) {
    return 'provider_rate_limited';
  }
  if (haystack.includes('validat') || haystack.includes('invalid')) {
    return 'provider_validation';
  }
  return 'provider_error';
}
