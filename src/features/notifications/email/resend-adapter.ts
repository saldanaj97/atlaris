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
          const outcome = classifyResendOutcome(error);
          throw new EmailProviderError(
            outcome === 'rejected'
              ? 'Email provider rejected the send request.'
              : 'Email provider request failed with an unknown outcome.',
            classifyResendError(error),
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
export function classifyResendOutcome(error: ErrorResponse): ProviderOutcome {
  if (error.statusCode === null) {
    return 'unknown';
  }

  switch (error.name) {
    case 'rate_limit_exceeded':
    case 'monthly_quota_exceeded':
    case 'daily_quota_exceeded':
    case 'invalid_api_key':
    case 'missing_api_key':
    case 'restricted_api_key':
    case 'invalid_from_address':
    case 'invalid_access':
    case 'invalid_region':
    case 'validation_error':
    case 'invalid_parameter':
    case 'missing_required_field':
    case 'invalid_attachment':
    case 'invalid_idempotency_key':
    case 'invalid_idempotent_request':
    case 'not_found':
    case 'method_not_allowed':
      return 'rejected';
    case 'concurrent_idempotent_requests':
    case 'application_error':
    case 'internal_server_error':
    case 'security_error':
      return 'unknown';
    default: {
      const _exhaustive: never = error.name;
      void _exhaustive;
      return 'unknown';
    }
  }
}

export function classifyResendError(error: ErrorResponse): string {
  switch (error.name) {
    case 'rate_limit_exceeded':
    case 'monthly_quota_exceeded':
    case 'daily_quota_exceeded':
      return 'provider_rate_limited';
    case 'invalid_api_key':
    case 'missing_api_key':
    case 'restricted_api_key':
    case 'invalid_from_address':
    case 'invalid_access':
    case 'invalid_region':
      return 'provider_configuration';
    case 'validation_error':
    case 'invalid_parameter':
    case 'missing_required_field':
    case 'invalid_attachment':
    case 'invalid_idempotency_key':
      return 'provider_request_invalid';
    case 'invalid_idempotent_request':
      return 'provider_idempotency_conflict';
    case 'concurrent_idempotent_requests':
    case 'application_error':
    case 'internal_server_error':
    case 'security_error':
    case 'not_found':
    case 'method_not_allowed':
      return 'provider_error';
    default: {
      const _exhaustive: never = error.name;
      void _exhaustive;
      return 'provider_error';
    }
  }
}
