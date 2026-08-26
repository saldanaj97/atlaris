import { assertLocalIntegrationDatabaseUrl } from '../../helpers/assert-local-database-url';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { GET, PATCH } from '@/app/api/v1/user/preferences/route';
import { getDefaultModelForTier } from '@/features/ai/ai-models';
import { STARTER_OUTLINE_REGENERATION_MODEL_IDS } from '@/features/ai/model-operation-policy';
import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { userPreferences, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

assertLocalIntegrationDatabaseUrl();

type ApiModelResponse = {
  id: string;
  name: string;
  provider: string;
  description: string;
  tier: string;
  contextWindow: number;
};

const PLAN_OPERATION = 'initial_outline' as const;
const STARTER_PERSISTABLE_MODELS = getPersistableModelsForTier(
  'starter',
  PLAN_OPERATION,
);
const STARTER_MODEL_ID = STARTER_PERSISTABLE_MODELS[0]?.id;
const SECOND_STARTER_MODEL_ID =
  STARTER_PERSISTABLE_MODELS[1]?.id ?? STARTER_MODEL_ID;
const THIRD_STARTER_MODEL_ID =
  STARTER_PERSISTABLE_MODELS[2]?.id ?? SECOND_STARTER_MODEL_ID;
const PRO_MODEL_ID = getPersistableModelsForTier('pro', PLAN_OPERATION).find(
  ({ id }) => !STARTER_PERSISTABLE_MODELS.some((model) => model.id === id),
)?.id;
const PRO_REGEN_MODEL_ID = 'google/gemini-3-pro-preview';
const PRO_LESSON_MODEL_ID = 'google/gemini-3-flash-preview';
const FREE_EFFECTIVE_MODEL = getDefaultModelForTier('free', PLAN_OPERATION);
const STARTER_EFFECTIVE_MODEL = getDefaultModelForTier(
  'starter',
  PLAN_OPERATION,
);
const PRO_LESSON_DEFAULT = getDefaultModelForTier('pro', 'lesson');

if (
  !STARTER_MODEL_ID ||
  !SECOND_STARTER_MODEL_ID ||
  !THIRD_STARTER_MODEL_ID ||
  !PRO_MODEL_ID
) {
  throw new Error('Expected starter and pro persistable model fixtures');
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

async function readSavedPreferenceRow(authUserId: string) {
  const userRow = await db.query.users.findFirst({
    where: (fields, operators) => operators.eq(fields.authUserId, authUserId),
  });
  expect(userRow).toBeDefined();

  const [preferencesRow] = await db
    .select({
      preferredAiModel: userPreferences.preferredAiModel,
      preferredRegenerationAiModel:
        userPreferences.preferredRegenerationAiModel,
      preferredLessonAiModel: userPreferences.preferredLessonAiModel,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userRow!.id));

  return preferencesRow;
}

describe('GET /api/v1/user/preferences', () => {
  const testAuthUserId = `preferences-get-user-${Date.now()}`;

  beforeEach(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
    });
  });

  afterAll(() => {
    clearTestUser();
  });

  it('returns empty availableModels for Free and does not invent a saved preference', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = expectJsonObject(await response.json());
    expect(data.preferredAiModel).toBeNull();
    expect(data.preferredRegenerationAiModel).toBeNull();
    expect(data.preferredLessonAiModel).toBeNull();
    expect(data.effectivePreferredAiModel).toBe(FREE_EFFECTIVE_MODEL);
    expect(data.effectivePreferredAiModel).toBe(AI_DEFAULT_MODEL);
    expect(expectModelArray(data.availableModels)).toEqual([]);
  });

  it('returns models with correct structure', async () => {
    setTestUser(testAuthUserId);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = expectJsonObject(await response.json());
    const availableModels = expectModelArray(data.availableModels);
    expect(availableModels).toEqual([]);
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

  beforeEach(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
      subscriptionTier: 'starter',
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
        preferredAiModel: STARTER_MODEL_ID,
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const data = expectJsonObject(await response.json());
    expect(data.message).toBe('Preferences updated');
    expect(data.preferredAiModel).toBe(STARTER_MODEL_ID);

    const preferencesRow = await readSavedPreferenceRow(testAuthUserId);
    expect(preferencesRow?.preferredAiModel).toBe(STARTER_MODEL_ID);
    expect(preferencesRow?.preferredRegenerationAiModel).toBeNull();
    expect(preferencesRow?.preferredLessonAiModel).toBeNull();
  });

  it('clears preferredAiModel with null PATCH and GET keeps saved null plus effective default', async () => {
    setTestUser(testAuthUserId);

    const setRequest = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferredAiModel: SECOND_STARTER_MODEL_ID,
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
    const getData = expectJsonObject(await getResponse.json());
    expect(getData.preferredAiModel).toBeNull();
    expect(getData.effectivePreferredAiModel).toBe(STARTER_EFFECTIVE_MODEL);
  });

  it('persists preferredAiModel and returns it on GET as the saved value', async () => {
    setTestUser(testAuthUserId);
    const resetModel = STARTER_MODEL_ID;

    const patchRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: SECOND_STARTER_MODEL_ID,
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
    expect(getData.preferredAiModel).toBe(SECOND_STARTER_MODEL_ID);
    expect(getData.effectivePreferredAiModel).toBe(SECOND_STARTER_MODEL_ID);

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
          preferredAiModel: SECOND_STARTER_MODEL_ID,
        }),
      },
    );

    const firstResponse = await PATCH(firstRequest);
    expect(firstResponse.status).toBe(200);

    const firstData = expectJsonObject(await firstResponse.json());
    expect(firstData.preferredAiModel).toBe(SECOND_STARTER_MODEL_ID);

    const secondRequest = new Request(
      'http://localhost/api/v1/user/preferences',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredAiModel: STARTER_MODEL_ID,
        }),
      },
    );

    const secondResponse = await PATCH(secondRequest);
    expect(secondResponse.status).toBe(200);

    const secondData = expectJsonObject(await secondResponse.json());
    expect(secondData.preferredAiModel).toBe(STARTER_MODEL_ID);
  });

  it('can save exactly the three Starter outline IDs and leaves lesson unused', async () => {
    setTestUser(testAuthUserId);
    expect([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]).toEqual([
      STARTER_MODEL_ID,
      SECOND_STARTER_MODEL_ID,
      THIRD_STARTER_MODEL_ID,
    ]);

    for (const modelId of STARTER_OUTLINE_REGENERATION_MODEL_IDS) {
      const response = await PATCH(
        new Request('http://localhost/api/v1/user/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferredAiModel: modelId }),
        }),
      );
      expect(response.status).toBe(200);
      const data = expectJsonObject(await response.json());
      expect(data.preferredAiModel).toBe(modelId);
      expect(data.preferredLessonAiModel).toBeNull();
    }

    const lessonResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLessonAiModel: STARTER_MODEL_ID }),
      }),
    );
    expect(lessonResponse.status).toBe(403);
    const lessonData = expectJsonObject(await lessonResponse.json());
    expect(lessonData.code).toBe('MODEL_NOT_ALLOWED_FOR_TIER');

    const row = await readSavedPreferenceRow(testAuthUserId);
    expect(row?.preferredAiModel).toBe(THIRD_STARTER_MODEL_ID);
    expect(row?.preferredLessonAiModel).toBeNull();
    expect(row?.preferredRegenerationAiModel).toBeNull();
  });

  it('rejects invalid model ID with validation error and keeps the previous saved value', async () => {
    setTestUser(testAuthUserId);

    const seedResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: STARTER_MODEL_ID }),
      }),
    );
    expect(seedResponse.status).toBe(200);

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
    expect(data.code).toBe('MODEL_INVALID');

    const getData = expectJsonObject(
      await (
        await GET(
          new Request('http://localhost/api/v1/user/preferences', {
            method: 'GET',
          }),
        )
      ).json(),
    );
    expect(getData.preferredAiModel).toBe(STARTER_MODEL_ID);
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
        preferredAiModel: STARTER_MODEL_ID,
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
        preferredAiModel: STARTER_MODEL_ID,
        extraField: 'not-allowed',
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('rejects tier-denied model with 403 and keeps the previous saved value', async () => {
    setTestUser(testAuthUserId);

    const seedResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: STARTER_MODEL_ID }),
      }),
    );
    expect(seedResponse.status).toBe(200);

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

    const getData = expectJsonObject(
      await (
        await GET(
          new Request('http://localhost/api/v1/user/preferences', {
            method: 'GET',
          }),
        )
      ).json(),
    );
    expect(getData.preferredAiModel).toBe(STARTER_MODEL_ID);
  });
});

describe('GET /api/v1/user/preferences — Pro save then Free downgrade', () => {
  const testAuthUserId = `preferences-downgrade-invalid-${Date.now()}`;

  beforeEach(async () => {
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
    if (patchResponse.status !== 200) {
      throw new Error(
        `Failed to seed preferred model, status ${patchResponse.status}`,
      );
    }

    await db
      .update(users)
      .set({ subscriptionTier: 'free' })
      .where(eq(users.authUserId, testAuthUserId));
  });

  afterAll(() => {
    clearTestUser();
  });

  it('returns the saved paid ID plus effective Free router and does not rewrite the row', async () => {
    const before = await readSavedPreferenceRow(testAuthUserId);
    expect(before?.preferredAiModel).toBe(PRO_MODEL_ID);

    const request = new Request('http://localhost/api/v1/user/preferences', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = expectJsonObject(await response.json());
    expect(data.preferredAiModel).toBe(PRO_MODEL_ID);
    expect(data.effectivePreferredAiModel).toBe(AI_DEFAULT_MODEL);
    expect(data.effectivePreferredAiModel).not.toBe(data.preferredAiModel);
    expect(expectModelArray(data.availableModels)).toEqual([]);

    const after = await readSavedPreferenceRow(testAuthUserId);
    expect(after).toEqual(before);
  });

  it('rejects PATCH of the GET saved paid ID while Free and leaves the row unchanged', async () => {
    const before = await readSavedPreferenceRow(testAuthUserId);
    expect(before?.preferredAiModel).toBe(PRO_MODEL_ID);

    const getResponse = await GET(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'GET',
      }),
    );
    expect(getResponse.status).toBe(200);
    const getData = expectJsonObject(await getResponse.json());
    expect(getData.preferredAiModel).toBe(PRO_MODEL_ID);

    const patchResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredAiModel: getData.preferredAiModel,
        }),
      }),
    );
    expect(patchResponse.status).toBe(403);
    const patchData = expectJsonObject(await patchResponse.json());
    expect(patchData.code).toBe('MODEL_NOT_ALLOWED_FOR_TIER');

    const after = await readSavedPreferenceRow(testAuthUserId);
    expect(after).toEqual(before);
  });
});

describe('PATCH /api/v1/user/preferences — Free', () => {
  const testAuthUserId = `preferences-free-patch-${Date.now()}`;

  beforeEach(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
      subscriptionTier: 'free',
    });
    setTestUser(testAuthUserId);
  });

  afterAll(() => {
    clearTestUser();
  });

  it('rejects any non-null model save with 403', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: STARTER_MODEL_ID }),
      }),
    );
    expect(response.status).toBe(403);
    const data = expectJsonObject(await response.json());
    expect(data.code).toBe('MODEL_NOT_ALLOWED_FOR_TIER');

    const getData = expectJsonObject(
      await (
        await GET(
          new Request('http://localhost/api/v1/user/preferences', {
            method: 'GET',
          }),
        )
      ).json(),
    );
    expect(getData.preferredAiModel).toBeNull();
    expect(getData.availableModels).toEqual([]);
  });

  it('rejects an unknown model id with 403 rather than MODEL_INVALID', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: 'invalid/model-id' }),
      }),
    );
    expect(response.status).toBe(403);
    const data = expectJsonObject(await response.json());
    expect(data.code).toBe('MODEL_NOT_ALLOWED_FOR_TIER');
  });
});

describe('PATCH /api/v1/user/preferences — Pro slots', () => {
  const testAuthUserId = `preferences-pro-slots-${Date.now()}`;

  beforeEach(async () => {
    await ensureUser({
      authUserId: testAuthUserId,
      email: `${testAuthUserId}@example.com`,
      subscriptionTier: 'pro',
    });
    setTestUser(testAuthUserId);
  });

  afterAll(() => {
    clearTestUser();
  });

  it('saves three slots independently and uses operation defaults only as effective', async () => {
    const outlineResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: PRO_MODEL_ID }),
      }),
    );
    expect(outlineResponse.status).toBe(200);

    const regenResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredRegenerationAiModel: PRO_REGEN_MODEL_ID,
        }),
      }),
    );
    expect(regenResponse.status).toBe(200);

    const lessonResponse = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLessonAiModel: PRO_LESSON_MODEL_ID }),
      }),
    );
    expect(lessonResponse.status).toBe(200);

    const savedGet = expectJsonObject(
      await (
        await GET(
          new Request('http://localhost/api/v1/user/preferences', {
            method: 'GET',
          }),
        )
      ).json(),
    );
    expect(savedGet.preferredAiModel).toBe(PRO_MODEL_ID);
    expect(savedGet.preferredRegenerationAiModel).toBe(PRO_REGEN_MODEL_ID);
    expect(savedGet.preferredLessonAiModel).toBe(PRO_LESSON_MODEL_ID);
    expect(savedGet.effectivePreferredAiModel).toBe(PRO_MODEL_ID);
    expect(savedGet.effectivePreferredRegenerationAiModel).toBe(
      PRO_REGEN_MODEL_ID,
    );
    expect(savedGet.effectivePreferredLessonAiModel).toBe(PRO_LESSON_MODEL_ID);

    const clearLesson = await PATCH(
      new Request('http://localhost/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLessonAiModel: null }),
      }),
    );
    expect(clearLesson.status).toBe(200);

    const clearedGet = expectJsonObject(
      await (
        await GET(
          new Request('http://localhost/api/v1/user/preferences', {
            method: 'GET',
          }),
        )
      ).json(),
    );
    expect(clearedGet.preferredAiModel).toBe(PRO_MODEL_ID);
    expect(clearedGet.preferredRegenerationAiModel).toBe(PRO_REGEN_MODEL_ID);
    expect(clearedGet.preferredLessonAiModel).toBeNull();
    expect(clearedGet.effectivePreferredLessonAiModel).toBe(PRO_LESSON_DEFAULT);
  });
});
