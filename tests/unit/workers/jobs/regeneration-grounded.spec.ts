import type { GroundedRegenerationStageInput } from '@/features/jobs/regeneration-run';
import type { DbClient } from '@/lib/db/types';

import { createGroundedRegenerationStages } from '../../../../workers/jobs/src/jobs/regeneration-grounded';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runPlanResearchSteps: vi.fn(),
}));

vi.mock(
  '../../../../workers/jobs/src/workflows/plan-generation/research',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../workers/jobs/src/workflows/plan-generation/research')
    >()),
    runPlanResearchSteps: mocks.runPlanResearchSteps,
  }),
);

const STAGE: GroundedRegenerationStageInput = {
  planId: 'plan-1',
  userId: 'user-1',
  tier: 'starter',
  input: {
    topic: 'Rust ownership',
    skillLevel: 'beginner',
    learningStyle: 'mixed',
    weeklyHours: 5,
    startDate: '2026-11-02',
    deadlineDate: '2026-11-16',
  },
  guidance: null,
  attemptStartedAt: '2026-10-30T12:00:00.000Z',
  db: {} as DbClient,
};

describe('createGroundedRegenerationStages research (DEV-171)', () => {
  beforeEach(() => {
    mocks.runPlanResearchSteps.mockResolvedValue({ status: 'failed_skipped' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.runPlanResearchSteps.mockReset();
  });

  // The switch's own on/off rules are covered in switches.spec.ts.
  it('researches directly when the Worker switch is on', async () => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
    const stages = createGroundedRegenerationStages({
      env: { PARALLEL_DIRECT_RESEARCH: 'true' },
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    await stages.research(STAGE);

    expect(mocks.runPlanResearchSteps).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        planId: 'plan-1',
        tier: 'starter',
        directSearch: true,
      }),
    );
  });
});
