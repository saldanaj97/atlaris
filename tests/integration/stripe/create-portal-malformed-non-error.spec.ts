import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCreatePortalHandler } from '@/app/api/v1/stripe/create-portal/route';
import type { ParseJsonBodyOptions } from '@/lib/api/parse-json-body';
import { logger } from '@/lib/logging/logger';
import { makeStripeMock } from '../../fixtures/stripe-mocks';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { markUserAsSubscribed } from '../../helpers/subscription';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

type ParseJsonBody = (
  req: Request,
  options: ParseJsonBodyOptions,
) => Promise<unknown>;

const defaultParseJsonBodyImplementation = async (
  _req: Request,
  options: ParseJsonBodyOptions,
): Promise<unknown> => {
  throw options.onMalformedJson('boom');
};

function createMockStripe() {
  return makeStripeMock({
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: 'https://billing.stripe.com/session',
        }),
      },
    },
  });
}

describe('create-portal malformed JSON factory (non-Error err)', () => {
  const mockParseJsonBody = vi.fn<ParseJsonBody>(
    defaultParseJsonBodyImplementation,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseJsonBody.mockImplementation(defaultParseJsonBodyImplementation);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearTestUser();
  });

  it('records parseError via String(err) when onMalformedJson receives a non-Error', async () => {
    const authUserId = buildTestAuthUserId('portal-non-error-boom');
    const email = buildTestEmail(authUserId);
    const userId = await ensureUser({ authUserId, email });
    await markUserAsSubscribed(userId, {
      subscriptionStatus: 'active',
    });
    setTestUser(authUserId);

    const portalPOST = createCreatePortalHandler({
      stripe: createMockStripe(),
      parseJsonBody: mockParseJsonBody,
    });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const request = new Request(
      'http://localhost/api/v1/stripe/create-portal',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    const response = await portalPOST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Malformed JSON body',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Malformed JSON body',
        parseError: 'boom',
      }),
      'API error',
    );
  });

  it('records parseError for numeric non-Error rejection', async () => {
    mockParseJsonBody.mockImplementationOnce(
      async (
        _req: Request,
        options: ParseJsonBodyOptions,
      ): Promise<unknown> => {
        throw options.onMalformedJson(42);
      },
    );

    const authUserId = buildTestAuthUserId('portal-non-error-num');
    const email = buildTestEmail(authUserId);
    const userId = await ensureUser({ authUserId, email });
    await markUserAsSubscribed(userId, {
      subscriptionStatus: 'active',
    });
    setTestUser(authUserId);

    const portalPOST = createCreatePortalHandler({
      stripe: createMockStripe(),
      parseJsonBody: mockParseJsonBody,
    });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const request = new Request(
      'http://localhost/api/v1/stripe/create-portal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );

    const response = await portalPOST(request);

    expect(response.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        parseError: '42',
      }),
      'API error',
    );
  });
});
