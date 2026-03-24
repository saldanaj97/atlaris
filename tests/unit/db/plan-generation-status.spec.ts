import { describe, expect, it } from 'vitest';

import {
  PLAN_GENERATING_INSERT_DEFAULTS,
  setLearningPlanGenerating,
} from '@/lib/db/queries/helpers/plan-generation-status';
import { learningPlans } from '@/lib/db/schema';

describe('plan-generation-status helpers', () => {
  describe('PLAN_GENERATING_INSERT_DEFAULTS', () => {
    it('contains exactly generationStatus and isQuotaEligible', () => {
      expect(Object.keys(PLAN_GENERATING_INSERT_DEFAULTS).sort()).toEqual([
        'generationStatus',
        'isQuotaEligible',
      ]);
    });

    it('sets generationStatus to generating', () => {
      expect(PLAN_GENERATING_INSERT_DEFAULTS.generationStatus).toBe(
        'generating'
      );
    });

    it('sets isQuotaEligible to false', () => {
      expect(PLAN_GENERATING_INSERT_DEFAULTS.isQuotaEligible).toBe(false);
    });
  });

  describe('setLearningPlanGenerating', () => {
    it('calls update with exactly generationStatus and updatedAt', async () => {
      const planId = 'plan-abc';
      const updatedAt = new Date('2026-01-15T10:00:00.000Z');

      let capturedSet: Record<string, unknown> | undefined;
      let capturedWhere: unknown;

      const mockWhere = (condition: unknown) => {
        capturedWhere = condition;
        return Promise.resolve();
      };

      const mockSet = (values: Record<string, unknown>) => {
        capturedSet = values;
        return { where: mockWhere };
      };

      let capturedTable: unknown;
      const mockUpdate = (table: unknown) => {
        capturedTable = table;
        return { set: mockSet };
      };
      const tx = { update: mockUpdate } as unknown as Parameters<
        typeof setLearningPlanGenerating
      >[0];

      await setLearningPlanGenerating(tx, { planId, updatedAt });

      expect(capturedSet).toBeDefined();
      expect(Object.keys(capturedSet ?? {}).sort()).toEqual([
        'generationStatus',
        'updatedAt',
      ]);
      expect(capturedSet?.generationStatus).toBe('generating');
      expect(capturedSet?.updatedAt).toBe(updatedAt);
      expect(capturedWhere).toBeDefined();
      const { inspect } = await import('node:util');
      const whereStr = inspect(capturedWhere, { depth: null });
      expect(whereStr).toContain(planId);
      expect(capturedTable).toBe(learningPlans);
    });
  });
});
