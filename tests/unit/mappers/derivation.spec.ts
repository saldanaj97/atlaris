import { describe, expect, it } from 'vitest';

import { ATTEMPT_CAP } from '@/features/ai/generation-policy';
import { toClientPlanDetail } from '@/features/plans/read-models/detail';
import {
  buildGenerationAttempt,
  buildModule,
  buildPlan,
  buildPlanDetail,
} from '../../fixtures/plan-detail';

describe('derived plan status mapping', () => {
  it('returns pending when no modules and attempts below cap', () => {
    const detail = buildPlanDetail({
      attemptsCount: ATTEMPT_CAP - 1,
      plan: buildPlan({ generationStatus: 'ready', modules: [] }),
    });
    const client = toClientPlanDetail(detail);
    expect(client?.status).toBe('pending');
  });

  it('returns ready when modules exist regardless of attempt count', () => {
    const detail = buildPlanDetail({
      plan: buildPlan({
        modules: [buildModule({ id: 'module-1', order: 1, tasks: [] })],
        generationStatus: 'ready',
        isQuotaEligible: true,
        finalizedAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      attemptsCount: ATTEMPT_CAP,
      latestAttempt: buildGenerationAttempt({
        status: 'success',
        classification: null,
        modulesCount: 1,
        tasksCount: 3,
      }),
    });
    const client = toClientPlanDetail(detail);
    expect(client?.status).toBe('ready');
    expect(client?.modules).toHaveLength(1);
    expect(client?.latestAttempt?.classification).toBeNull();
  });

  it('returns failed when attempt cap reached without modules', () => {
    const detail = buildPlanDetail({
      plan: buildPlan({
        modules: [],
        generationStatus: 'failed',
      }),
      attemptsCount: ATTEMPT_CAP,
      latestAttempt: buildGenerationAttempt({
        classification: 'capped',
        status: 'failure',
      }),
    });
    const client = toClientPlanDetail(detail);
    expect(client?.status).toBe('failed');
  });

  it('remains failed after additional capped attempts beyond the third', () => {
    const detail = buildPlanDetail({
      plan: buildPlan({
        modules: [],
        generationStatus: 'failed',
      }),
      attemptsCount: ATTEMPT_CAP + 1,
      latestAttempt: buildGenerationAttempt({
        id: 'attempt-4',
        classification: 'capped',
        status: 'failure',
      }),
    });
    const client = toClientPlanDetail(detail);
    expect(client?.status).toBe('failed');
  });
});
