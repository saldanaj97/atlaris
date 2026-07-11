import type { ErrorResponse } from 'resend';

import {
  classifyResendError,
  classifyResendOutcome,
  createResendEmailSender,
  EmailProviderError,
  type ResendEmailsClient,
} from '@/features/notifications/email/resend-adapter';
import { describe, expect, it, vi } from 'vitest';

function error(
  name: ErrorResponse['name'],
  statusCode: number | null = 400,
  message: string = name,
): ErrorResponse {
  return { name, message, statusCode };
}

describe('classifyResendError', () => {
  it.each([
    ['invalid_api_key', 'provider_configuration'],
    ['invalid_from_address', 'provider_configuration'],
    ['missing_api_key', 'provider_configuration'],
    ['restricted_api_key', 'provider_configuration'],
    ['invalid_access', 'provider_configuration'],
    ['invalid_region', 'provider_configuration'],
    ['rate_limit_exceeded', 'provider_rate_limited'],
    ['monthly_quota_exceeded', 'provider_rate_limited'],
    ['daily_quota_exceeded', 'provider_rate_limited'],
    ['validation_error', 'provider_request_invalid'],
    ['invalid_parameter', 'provider_request_invalid'],
    ['missing_required_field', 'provider_request_invalid'],
    ['invalid_attachment', 'provider_request_invalid'],
    ['invalid_idempotent_request', 'provider_idempotency_conflict'],
    ['internal_server_error', 'provider_error'],
    ['application_error', 'provider_error'],
  ] as const)('maps %s to %s', (name, expected) => {
    expect(classifyResendError(error(name))).toBe(expected);
  });

  it('treats a forbidden validation error as provider configuration', () => {
    expect(classifyResendError(error('validation_error', 403))).toBe(
      'provider_configuration',
    );
  });

  it('distinguishes recipient validation from shared request validation', () => {
    expect(
      classifyResendError(
        error(
          'validation_error',
          422,
          'Invalid `to` field. The email address must be valid.',
        ),
      ),
    ).toBe('provider_recipient_invalid');
    expect(
      classifyResendError(
        error(
          'invalid_parameter',
          422,
          'Invalid `from` field. The email address must be valid.',
        ),
      ),
    ).toBe('provider_request_invalid');
  });
});

describe('classifyResendOutcome', () => {
  it.each([
    ['invalid_api_key', 401, 'rejected'],
    ['validation_error', 400, 'rejected'],
    ['rate_limit_exceeded', 429, 'retryable'],
    ['invalid_idempotent_request', 409, 'rejected'],
    ['application_error', 500, 'retryable'],
    ['internal_server_error', 500, 'retryable'],
    ['concurrent_idempotent_requests', 409, 'unknown'],
    ['security_error', 403, 'unknown'],
  ] as const)('maps %s/%s to %s', (name, statusCode, expected) => {
    expect(classifyResendOutcome(error(name, statusCode))).toBe(expected);
  });

  it('treats null statusCode as unknown even for named client errors', () => {
    expect(classifyResendOutcome(error('application_error', null))).toBe(
      'unknown',
    );
    expect(classifyResendOutcome(error('validation_error', null))).toBe(
      'unknown',
    );
  });
});

describe('createResendEmailSender', () => {
  it('resolves a persisted provider request without calling Resend', () => {
    const client: ResendEmailsClient = {
      send: vi.fn(),
    };
    const sender = createResendEmailSender(
      {
        apiKey: 're_test',
        from: 'Atlaris <notifications@mail.atlaris.app>',
        replyTo: 'support@atlaris.app',
      },
      client,
    );

    expect(
      sender.resolveRequest({
        to: 'u@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        headers: { 'List-Unsubscribe': '<https://example.com>' },
        idempotencyKey: 'key-1',
      }),
    ).toEqual({
      from: 'Atlaris <notifications@mail.atlaris.app>',
      to: 'u@example.com',
      replyTo: 'support@atlaris.app',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
      headers: { 'List-Unsubscribe': '<https://example.com>' },
      idempotencyKey: 'key-1',
    });
    expect(client.send).not.toHaveBeenCalled();
  });

  it('throws rejected EmailProviderError for structured Resend errors', async () => {
    const client: ResendEmailsClient = {
      send: vi.fn().mockResolvedValue({
        data: null,
        error: error('invalid_api_key', 401),
      }),
    };
    const sender = createResendEmailSender(
      {
        apiKey: 're_test',
        from: 'Atlaris <notifications@mail.atlaris.app>',
      },
      client,
    );

    await expect(
      sender.sendResolved({
        from: 'Atlaris <notifications@mail.atlaris.app>',
        to: 'u@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toMatchObject({
      name: 'EmailProviderError',
      failureClass: 'provider_configuration',
      outcome: 'rejected',
    } satisfies Partial<EmailProviderError>);
  });

  it('throws outcome-unknown for application_error with null statusCode', async () => {
    const client: ResendEmailsClient = {
      send: vi.fn().mockResolvedValue({
        data: null,
        error: error('application_error', null),
      }),
    };
    const sender = createResendEmailSender(
      {
        apiKey: 're_test',
        from: 'Atlaris <notifications@mail.atlaris.app>',
      },
      client,
    );

    await expect(
      sender.sendResolved({
        from: 'Atlaris <notifications@mail.atlaris.app>',
        to: 'u@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toMatchObject({
      failureClass: 'provider_error',
      outcome: 'unknown',
    });
  });

  it('throws outcome-unknown EmailProviderError for thrown network errors', async () => {
    const client: ResendEmailsClient = {
      send: vi.fn().mockRejectedValue(new Error('socket hang up')),
    };
    const sender = createResendEmailSender(
      {
        apiKey: 're_test',
        from: 'Atlaris <notifications@mail.atlaris.app>',
      },
      client,
    );

    await expect(
      sender.sendResolved({
        from: 'Atlaris <notifications@mail.atlaris.app>',
        to: 'u@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toMatchObject({
      failureClass: 'provider_error',
      outcome: 'unknown',
    });
  });

  it('returns provider message id on success', async () => {
    const client: ResendEmailsClient = {
      send: vi.fn().mockResolvedValue({
        data: { id: 're_123' },
        error: null,
      }),
    };
    const sender = createResendEmailSender(
      {
        apiKey: 're_test',
        from: 'Atlaris <notifications@mail.atlaris.app>',
      },
      client,
    );

    await expect(
      sender.sendResolved({
        from: 'Atlaris <notifications@mail.atlaris.app>',
        to: 'u@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        idempotencyKey: 'key-1',
      }),
    ).resolves.toEqual({ providerMessageId: 're_123' });
  });
});
