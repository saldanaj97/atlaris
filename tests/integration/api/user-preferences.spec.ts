import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET, PATCH } from '@/app/api/v1/user/preferences/route';
import { getDefaultModelForTier } from '@/features/ai/ai-models';
import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

type ApiModelResponse = {
  id: string;
  name: string;
  provider: string;
  description: string;
  tier: string;
  contextWindow: number;
};

// Prevent tests from running against production database
if (process.env.DATABASE_URL?.includes('neon.tech')) {
  throw new Error('DO NOT RUN TESTS AGAINST REMOTE DB');
}

const FREE_PERSISTABLE_MODELS = getPersistableModelsForTier('free');
const FREE_MODEL_ID = FREE_PERSISTABLE_MODELS[0]?.id;
const SECOND_FREE_MODEL_ID = FREE_PERSISTABLE_MODELS[1]?.id ?? FREE_MODEL_ID;
const PRO_MODEL_ID = getPersistableModelsForTier('pro').find(
  ({ id }) => !FREE_PERSISTABLE_MODELS.some((model) => model.id === id),
)?.id;

if (!FREE_MODEL_ID || !SECOND_FREE_MODEL_ID || !PRO_MODEL_ID) {
  throw new Error('Expected free and pro persistable model fixtures');
}

function expectJsonObject(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function expectModelArray(value: unknown): ApiModelResponse[] {
  expect(Array.isArray(value)).toBe(true);
  return value as ApiModelResponse[];
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

    const data = expectJsonObject(await response.json());
    const availableModels = expectModelArray(data.availableModels);
    expect(availableModels.length).toBe(
      getPersistableModelsForTier('free').length,
    );
    expect(availableModels.some((m) => m.id === 'openrouter/free')).toBe(false);
  });

  it('returns default preferredAiModel when user has not set one', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = expectJsonObject(await response.json());
    expect(data.preferredAiModel).toBe(getDefaultModelForTier('free'));
  });

  it('returns models with correct structure', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = expectJsonObject(await response.json());

    const firstModel = expectModelArray(data.availableModels)[0];
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

  it('returns 400 when PATCH body is not valid JSON', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{ not json',
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    const data = expectJsonObject(await response.json());
    expect(data.error).toBe('Invalid JSON in request body');
  });

  it('accepts valid model ID', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: FREE_MODEL_ID,
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const data = expectJsonObject(await response.json());
    expect(data.message).toBe('Preferences updated');
    expect(data.preferredAiModel).toBe(FREE_MODEL_ID);
  });

  it('clears preferredAiModel with null PATCH and GET reflects tier default', async () => {
    setTestUser(testAuthUserId);

    const setRequest = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferredAiModel: SECOND_FREE_MODEL_ID,
      }),
    });
    const setResponse = await PATCH(setRequest);
    expect(setResponse.status).toBe(200);

    const clearRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: null }),
      },
    );
    const clearResponse = await PATCH(clearRequest);
    expect(clearResponse.status).toBe(200);
    const clearData = expectJsonObject(await clearResponse.json());
    expect(clearData.preferredAiModel).toBeNull();

    const getRequest = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });
    const getResponse = await GET(getRequest);
    expect(getResponse.status).toBe(200);
    const getData = await getResponse.json();
    expect(getData.preferredAiModel).toBe(getDefaultModelForTier('free'));
  });

  it('persists preferredAiModel and returns it on GET', async () => {
    setTestUser(testAuthUserId);
    // Use a concrete model from the DB enum — openrouter/free is a
    // generation-time router fallback, not a persistable preference.
    const resetModel = FREE_MODEL_ID;

    const patchRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: SECOND_FREE_MODEL_ID,
        }),
      },
    );

    const patchResponse = await PATCH(patchRequest);
    expect(patchResponse.status).toBe(200);

    const getRequest = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const getResponse = await GET(getRequest);
    expect(getResponse.status).toBe(200);

    const getData = expectJsonObject(await getResponse.json());
    expect(getData.preferredAiModel).toBe(SECOND_FREE_MODEL_ID);

    const resetRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: resetModel,
        }),
      },
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
          preferredAiModel: SECOND_FREE_MODEL_ID,
        }),
      },
    );

    const firstResponse = await PATCH(firstRequest);
    expect(firstResponse.status).toBe(200);

    const firstData = expectJsonObject(await firstResponse.json());
    expect(firstData.preferredAiModel).toBe(SECOND_FREE_MODEL_ID);

    const secondRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: FREE_MODEL_ID,
        }),
      },
    );

    const secondResponse = await PATCH(secondRequest);
    expect(secondResponse.status).toBe(200);

    const secondData = expectJsonObject(await secondResponse.json());
    expect(secondData.preferredAiModel).toBe(FREE_MODEL_ID);
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

    const data = expectJsonObject(await response.json());
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

  it('rejects explicit undefined preferredAiModel', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: undefined,
      }),
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
        preferredAiModel: FREE_MODEL_ID,
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
    expect(response.status).toBe(400);
  });

  it('rejects extra JSON fields with 400', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: FREE_MODEL_ID,
        extraField: 'not-allowed',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('rejects tier-denied model with 403', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: PRO_MODEL_ID,
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(403);
    const data = expectJsonObject(await response.json());
    expect(data.code).toBe('MODEL_NOT_ALLOWED_FOR_TIER');
  });
});

describe('GET /api/v1/user/preferences — invalid stored preference', () => {
  const testAuthUserId = `preferences-downgrade-invalid-${Date.now()}`;

  beforeAll(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
      subscriptionTier: 'pro',
    });
    setTestUser(testAuthUserId);

    const patchRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredAiModel: PRO_MODEL_ID,
        }),
      },
    );
    const patchResponse = await PATCH(patchRequest);
    expect(patchResponse.status).toBe(200);

    await db
      .update(users)
      .set({ subscriptionTier: 'free' })
      .where(eq(users.authUserId, testAuthUserId));
  });

  afterAll(() => {
    clearTestUser();
  });

  it('returns tier fallback when stored model is invalid for current tier', async () => {
    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = expectJsonObject(await response.json());
    expect(data.preferredAiModel).toBe(getDefaultModelForTier('free'));
  });
});
