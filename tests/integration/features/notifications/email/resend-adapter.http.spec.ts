/**
 * Scoped Resend HTTP contract pilot (JCS-47).
 *
 * Starts Microcks via `@mdelapenya/testcontainers-resend` only in this file —
 * not in global Postgres Testcontainers setup. Proves the production
 * `createResendEmailSender()` default SDK client can POST against the OpenAPI
 * mock and read a provider message id. Does not prove inbox delivery.
 *
 * OpenAPI source is pinned to an immutable Resend commit so CI does not float
 * on `main`. Upstream still downloads that URL at container start (falls back
 * to the package embedded copy if the download fails).
 */
import { ResendContainer } from '@mdelapenya/testcontainers-resend';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** Immutable Resend OpenAPI revision (resend.yaml @ Apache License commit). */
const RESEND_OPENAPI_SPEC_URL =
  'https://raw.githubusercontent.com/resend/resend-openapi/5ed9b8f91ab2adac005f2a2d43b3502e61e3aa6d/resend.yaml';

const FILE_TIMEOUT_MS = 360_000;
const HOOK_TIMEOUT_MS = 300_000;

type StartedResend = Awaited<ReturnType<ResendContainer['start']>>;

let container: StartedResend | null = null;
let coldStartMs = 0;
let warmStartMs = 0;

async function startPinnedResendContainer(): Promise<StartedResend> {
  return new ResendContainer().withSpecUrl(RESEND_OPENAPI_SPEC_URL).start();
}

describe('resend adapter HTTP contract (Testcontainers Microcks)', () => {
  beforeAll(async () => {
    const coldStartedAt = Date.now();
    const coldContainer = await startPinnedResendContainer();
    coldStartMs = Date.now() - coldStartedAt;
    await coldContainer.stop();

    const warmStartedAt = Date.now();
    container = await startPinnedResendContainer();
    warmStartMs = Date.now() - warmStartedAt;

    // Resend SDK captures RESEND_BASE_URL at module load — set before import.
    vi.stubEnv('RESEND_BASE_URL', container.getBaseUrl());
    vi.resetModules();

    console.info(
      `[resend-http-contract] coldStartMs=${coldStartMs} warmStartMs=${warmStartMs} baseUrl=${container.getBaseUrl()}`,
    );
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    try {
      vi.unstubAllEnvs();
      vi.resetModules();
    } finally {
      if (container) {
        await container.stop();
        container = null;
      }
    }
  }, HOOK_TIMEOUT_MS);

  it(
    'sends a complete persisted request through the default SDK client and returns a provider message id',
    async () => {
      expect(container).not.toBeNull();
      expect(coldStartMs).toBeGreaterThan(0);
      expect(warmStartMs).toBeGreaterThan(0);
      // Upstream allows up to 120s startup; warm should stay well under that.
      expect(warmStartMs).toBeLessThan(120_000);

      const { createResendEmailSender } =
        await import('@/features/notifications/email/resend-adapter');

      const sender = createResendEmailSender({
        apiKey: 're_test_contract',
        from: 'Atlaris <notifications@mail.atlaris.app>',
        replyTo: 'support@atlaris.app',
      });

      const request = sender.resolveRequest({
        to: 'contract@example.com',
        subject: 'Resend HTTP contract pilot',
        html: '<p>Contract</p>',
        text: 'Contract',
        headers: {
          'List-Unsubscribe':
            '<https://example.com/api/email/unsubscribe?token=test>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        idempotencyKey: 'user:daily_reminder:2026-08-07',
      });

      expect(request.headers?.['List-Unsubscribe']).toBeTruthy();
      expect(request.headers?.['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click',
      );
      expect(request.idempotencyKey).toBe('user:daily_reminder:2026-08-07');

      const result = await sender.sendResolved(request);

      expect(result.providerMessageId).toEqual(expect.any(String));
      expect(result.providerMessageId?.length).toBeGreaterThan(0);
    },
    FILE_TIMEOUT_MS,
  );
});
