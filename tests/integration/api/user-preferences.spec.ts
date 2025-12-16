import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET, PATCH } from '@/app/api/v1/user/preferences/route';
import { AVAILABLE_MODELS } from '@/lib/ai/models';

import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

describe.skip('GET /api/v1/user/preferences', () => {
  const testClerkUserId = `preferences-get-user-${Date.now()}`;

  beforeAll(async () => {
    await ensureUser({
      clerkUserId: testClerkUserId,
      email: `${testClerkUserId}@example.com`,
    });
  });

  afterAll(() => {
    clearTestUser();
  });

  it('returns available models for authenticated user', async () => {
    setTestUser(testClerkUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('availableModels');
    expect(Array.isArray(data.availableModels)).toBe(true);
    expect(data.availableModels.length).toBe(AVAILABLE_MODELS.length);
  });

  it('returns null for preferredAiModel (not yet implemented)', async () => {
    setTestUser(testClerkUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.preferredAiModel).toBeNull();
  });

  it('returns models with correct structure', async () => {
    setTestUser(testClerkUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    // Verify first model has expected properties
    const firstModel = data.availableModels[0];
    expect(firstModel).toHaveProperty('id');
    expect(firstModel).toHaveProperty('name');
    expect(firstModel).toHaveProperty('provider');
    expect(firstModel).toHaveProperty('description');
    expect(firstModel).toHaveProperty('tier');
    expect(firstModel).toHaveProperty('contextWindow');
    expect(firstModel).toHaveProperty('maxOutputTokens');
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

describe.skip('PATCH /api/v1/user/preferences', () => {
  const testClerkUserId = `preferences-patch-user-${Date.now()}`;

  beforeAll(async () => {
    await ensureUser({
      clerkUserId: testClerkUserId,
      email: `${testClerkUserId}@example.com`,
    });
  });

  afterAll(() => {
    clearTestUser();
  });

  it('accepts valid model ID', async () => {
    setTestUser(testClerkUserId);

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

  it('accepts another valid model ID', async () => {
    setTestUser(testClerkUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredAiModel: 'anthropic/claude-haiku-4.5',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.preferredAiModel).toBe('anthropic/claude-haiku-4.5');
  });

  it('rejects invalid model ID with validation error', async () => {
    setTestUser(testClerkUserId);

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
    setTestUser(testClerkUserId);

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
    setTestUser(testClerkUserId);

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
    setTestUser(testClerkUserId);

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
