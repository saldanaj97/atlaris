import type {
  EmailMessage,
  EmailSendResult,
  EmailSender,
  PersistedProviderRequest,
  ProviderOutcome,
} from './types';

import { EnvValidationError } from '@/lib/config/env/shared';
import { type ErrorResponse, Resend } from 'resend';

export type ResendAdapterConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

export type ResendEmailsClient = {
  send: (
    payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      headers?: Record<string, string>;
      replyTo?: string;
    },
    options?: { idempotencyKey?: string },
  ) => Promise<{ data: { id: string } | null; error: ErrorResponse | null }>;
};

export class EmailProviderError extends Error {
  readonly failureClass: string;
  readonly outcome: ProviderOutcome;

  constructor(
    message: string,
    failureClass: string,
    outcome: ProviderOutcome,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EmailProviderError';
    this.failureClass = failureClass;
    this.outcome = outcome;
  }
}

/**
 * Thin Resend sender. Never logs message bodies. Uses SDK idempotencyKey.
 */
export function createResendEmailSender(
  config: ResendAdapterConfig,
  client: ResendEmailsClient = new Resend(config.apiKey).emails,
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

  return {
    resolveRequest(message: EmailMessage): PersistedProviderRequest {
      return {
        from: config.from,
        to: message.to,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
        idempotencyKey: message.idempotencyKey,
      };
    },

    async sendResolved(
      request: PersistedProviderRequest,
    ): Promise<EmailSendResult> {
      try {
        const { data, error } = await client.send(
          {
            from: request.from,
            to: request.to,
            subject: request.subject,
            html: request.html,
            text: request.text,
            headers: request.headers,
            ...(request.replyTo ? { replyTo: request.replyTo } : {}),
          },
          { idempotencyKey: request.idempotencyKey },
        );

        if (error) {
          const { failureClass, outcome } = classifyResend(error);
          throw new EmailProviderError(
            outcome === 'rejected'
              ? 'Email provider rejected the send request.'
              : outcome === 'retryable'
                ? 'Email provider reported a retryable send failure.'
                : 'Email provider request failed with an unknown outcome.',
            failureClass,
            outcome,
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
          'unknown',
          { cause: err },
        );
      }
    },
  };
}

/**
 * Definite client/config/validation failures are `rejected` (safe to mark failed).
 * Transport/server ambiguity — including SDK `application_error` with null
 * statusCode — must stay `unknown` so the leased pending row is retained.
 */
function classifyResend(error: ErrorResponse): {
  failureClass: string;
  outcome: ProviderOutcome;
} {
  const classification = (() => {
    switch (error.name) {
      case 'rate_limit_exceeded':
        return {
          failureClass: 'provider_rate_limited',
          outcome: 'retryable',
        } as const;
      case 'monthly_quota_exceeded':
      case 'daily_quota_exceeded':
        return {
          failureClass: 'provider_rate_limited',
          outcome: 'rejected',
        } as const;
      case 'invalid_api_key':
      case 'missing_api_key':
      case 'restricted_api_key':
      case 'invalid_from_address':
      case 'invalid_access':
      case 'invalid_region':
        return {
          failureClass: 'provider_configuration',
          outcome: 'rejected',
        } as const;
      case 'validation_error':
        return {
          failureClass:
            error.statusCode === 403
              ? 'provider_configuration'
              : 'provider_request_invalid',
          outcome: 'rejected',
        } as const;
      case 'invalid_parameter':
        return {
          failureClass: 'provider_request_invalid',
          outcome: 'rejected',
        } as const;
      case 'missing_required_field':
      case 'invalid_attachment':
      case 'invalid_idempotency_key':
        return {
          failureClass: 'provider_request_invalid',
          outcome: 'rejected',
        } as const;
      case 'invalid_idempotent_request':
        return {
          failureClass: 'provider_idempotency_conflict',
          outcome: 'rejected',
        } as const;
      case 'not_found':
      case 'method_not_allowed':
        return {
          failureClass: 'provider_error',
          outcome: 'rejected',
        } as const;
      case 'application_error':
      case 'internal_server_error':
        return {
          failureClass: 'provider_error',
          outcome: 'retryable',
        } as const;
      case 'concurrent_idempotent_requests':
      case 'security_error':
        return {
          failureClass: 'provider_error',
          outcome: 'unknown',
        } as const;
      default: {
        const _exhaustive: never = error.name;
        void _exhaustive;
        return {
          failureClass: 'provider_error',
          outcome: 'unknown',
        } as const;
      }
    }
  })();

  return error.statusCode === null
    ? { ...classification, outcome: 'unknown' }
    : classification;
}

export function classifyResendOutcome(error: ErrorResponse): ProviderOutcome {
  return classifyResend(error).outcome;
}

export function classifyResendError(error: ErrorResponse): string {
  return classifyResend(error).failureClass;
}
