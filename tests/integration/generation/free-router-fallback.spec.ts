import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { getPlanFreeRouterFallback } from '@/lib/db/queries/plan-free-router-fallback';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { generationAttempts, modules } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '@tests/helpers/process-generation-attempt';
import { createRlsDbForUser } from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { resolveModelForTierMock } = vi.hoisted(() => ({
  resolveModelForTierMock: vi.fn(),
}));

vi.mock('@/features/ai/model-resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/model-resolver')>()),
  resolveModelForTier: resolveModelForTierMock,
}));

async function setupProPlan(label: string) {
  const authUserId = buildTestAuthUserId(label);
  setTestUser(authUserId);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
  const plan = await createTestPlan({
    userId,
    topic: 'Free router fallback topic',
    skillLevel: 'beginner',
    weeklyHours: 4,
    learningStyle: 'mixed',
  });
  return { authUserId, userId, plan };
}

function runGeneration(planId: string, userId: string) {
  return processTestGenerationAttempt(
    buildTestProcessGenerationInput({
      planId,
      userId,
      topic: 'Free router fallback topic',
      tier: 'pro',
    }),
  );
}

describe('free-router fallback flag (DEV-175)', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'success');
    vi.stubEnv('MOCK_GENERATION_FAILURE_RATE', '0');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  beforeEach(() => {
    resolveModelForTierMock.mockReset();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('persists the outline flag and reads it with lesson flags through RLS', async () => {
    resolveModelForTierMock.mockResolvedValue({
      modelId: AI_DEFAULT_MODEL,
      provider: new MockGenerationProvider({ delayMs: 0 }),
      fallback: true,
      fallbackReason: 'not_specified',
      freeRouterFallback: true,
    });
    const { authUserId, userId, plan } = await setupProPlan(
      'free-router-outline',
    );

    const result = await runGeneration(plan.id, userId);
    expect(result.status).toBe('generation_success');

    const [attempt] = await db
      .select({ metadata: generationAttempts.metadata })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempt?.metadata).toMatchObject({
      provider: { freeRouterFallback: true },
    });

    const flaggedModule = await createTestModule({
      planId: plan.id,
      order: 90,
    });
    const unflaggedModule = await createTestModule({
      planId: plan.id,
      order: 91,
    });
    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'ready',
        lessonGenerationMetadata: { version: 1, freeRouterFallback: true },
      })
      .where(eq(modules.id, flaggedModule.id));
    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'ready',
        lessonGenerationMetadata: { version: 1 },
      })
      .where(eq(modules.id, unflaggedModule.id));

    const ownerDb = await createRlsDbForUser(authUserId);
    await expect(getPlanFreeRouterFallback(plan.id, ownerDb)).resolves.toEqual({
      outline: true,
      lessonModuleCount: 1,
    });
  });

  it('leaves the flag off when the outline ran on a paid model', async () => {
    resolveModelForTierMock.mockResolvedValue({
      modelId: 'openai/gpt-6.1-sol',
      provider: new MockGenerationProvider({ delayMs: 0 }),
      fallback: true,
      fallbackReason: 'not_specified',
    });
    const { userId, plan } = await setupProPlan('free-router-paid');

    const result = await runGeneration(plan.id, userId);
    expect(result.status).toBe('generation_success');

    await expect(getPlanFreeRouterFallback(plan.id, db)).resolves.toEqual({
      outline: false,
      lessonModuleCount: 0,
    });
  });

  it('reads only the latest successful attempt', async () => {
    const { plan } = await setupProPlan('free-router-latest');
    const attemptBase = {
      planId: plan.id,
      status: 'success' as const,
      durationMs: 1,
      modulesCount: 1,
      tasksCount: 1,
    };
    await db.insert(generationAttempts).values({
      ...attemptBase,
      metadata: { provider: { freeRouterFallback: true } },
      createdAt: new Date('2026-10-20T15:00:00.000Z'),
    });
    await db.insert(generationAttempts).values({
      ...attemptBase,
      metadata: { provider: { model: 'openai/gpt-6.1-sol' } },
      createdAt: new Date('2026-10-21T15:00:00.000Z'),
    });

    await expect(getPlanFreeRouterFallback(plan.id, db)).resolves.toEqual({
      outline: false,
      lessonModuleCount: 0,
    });
  });
});
