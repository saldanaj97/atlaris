import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET, PATCH } from '@/app/api/v1/user/preferences/route';
import { getDefaultModelForTier, getModelsForTier } from '@/lib/ai/ai-models';

import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Prevent tests from running against production database
if (process.env.DATABASE_URL?.includes('neon.tech')) {
  throw new Error('DO NOT RUN TESTS AGAINST REMOTE DB');
}

describe('GET /api/v1/user/preferences', () => {
  const testAuthUserId = `preferences-get-user-${Date.now()}`;

  beforeAll(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
    });
  });

  afterAll(() => {
    clearTestUser();
  });

  it('returns available models for authenticated user', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('availableModels');
    expect(Array.isArray(data.availableModels)).toBe(true);
    expect(data.availableModels.length).toBe(getModelsForTier('free').length);
  });

  it('returns default preferredAiModel when user has not set one', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.preferredAiModel).toBe(getDefaultModelForTier('free'));
  });

  it('returns models with correct structure', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    const firstModel = data.availableModels[0];
    expect(firstModel).toBeDefined();

    // API contract: id is a non-empty string
    expect(typeof firstModel.id).toBe('string');
    expect(firstModel.id.length).toBeGreaterThan(0);

    // API contract: name is a non-empty string
    expect(typeof firstModel.name).toBe('string');
    expect(firstModel.name.length).toBeGreaterThan(0);

    // API contract: provider is a non-empty string
    expect(typeof firstModel.provider).toBe('string');
    expect(firstModel.provider.length).toBeGreaterThan(0);

    // API contract: description is a string (may be empty)
    expect(typeof firstModel.description).toBe('string');

    // API contract: tier is one of the allowed model tiers
    expect(['free', 'pro']).toContain(firstModel.tier);
    expect(typeof firstModel.tier).toBe('string');
    expect(firstModel.tier.length).toBeGreaterThan(0);

    // API contract: contextWindow is a positive integer
    expect(typeof firstModel.contextWindow).toBe('number');
    expect(Number.isInteger(firstModel.contextWindow)).toBe(true);
    expect(firstModel.contextWindow).toBeGreaterThan(0);
  });

  it('returns 401 for unauthenticated request', async () => {
    clearTestUser();

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/v1/user/preferences', () => {
  const testAuthUserId = `preferences-patch-user-${Date.now()}`;

  beforeAll(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
    });
  });

  afterAll(() => {
    clearTestUser();
  });

  it('accepts valid model ID', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toBe('Preferences updated');
    expect(data.preferredAiModel).toBe('google/gemini-2.0-flash-exp:free');
  });

  it('persists preferredAiModel and returns it on GET', async () => {
    setTestUser(testAuthUserId);
    const defaultModel = getDefaultModelForTier('free');

    const patchRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: 'anthropic/claude-haiku-4.5',
        }),
      }
    );

    const patchResponse = await PATCH(patchRequest);
    expect(patchResponse.status).toBe(200);

    const getRequest = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const getResponse = await GET(getRequest);
    expect(getResponse.status).toBe(200);

    const getData = await getResponse.json();
    expect(getData.preferredAiModel).toBe('anthropic/claude-haiku-4.5');

    const resetRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: defaultModel,
        }),
      }
    );

    const resetResponse = await PATCH(resetRequest);
    expect(resetResponse.status).toBe(200);
  });

  it('accepts another valid model ID', async () => {
    setTestUser(testAuthUserId);

    const firstRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: 'anthropic/claude-haiku-4.5',
        }),
      }
    );

    const firstResponse = await PATCH(firstRequest);
    expect(firstResponse.status).toBe(200);

    const firstData = await firstResponse.json();
    expect(firstData.preferredAiModel).toBe('anthropic/claude-haiku-4.5');

    const secondRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: 'google/gemini-2.0-flash-exp:free',
        }),
      }
    );

    const secondResponse = await PATCH(secondRequest);
    expect(secondResponse.status).toBe(200);

    const secondData = await secondResponse.json();
    expect(secondData.preferredAiModel).toBe(
      'google/gemini-2.0-flash-exp:free'
    );
  });

  it('rejects invalid model ID with validation error', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: 'invalid/model-id',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('rejects empty model ID', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: '',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('rejects missing preferredAiModel field', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('returns 401 for unauthenticated request', async () => {
    clearTestUser();

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it('rejects non-JSON body', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: 'not json',
    });

    const response = await PATCH(request);
    // Should return 400 or 500 due to JSON parse error
    expect([400, 500]).toContain(response.status);
  });
});
