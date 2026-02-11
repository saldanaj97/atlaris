import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateLearningPlan,
  type GenerateLearningPlanParams,
} from '@/app/plans/actions';

// Mock dependencies
const mockRunGenerationAttempt = vi.fn();
const mockGetEffectiveAuthUserId = vi.fn();
const mockGetUserByAuthId = vi.fn();
const mockGetDb = vi.fn();
const mockAtomicCheckAndInsertPlan = vi.fn();
const mockMarkPlanGenerationSuccess = vi.fn();
const mockMarkPlanGenerationFailure = vi.fn();
const mockRecordUsage = vi.fn();

vi.mock('@/lib/ai/orchestrator', () => ({
  runGenerationAttempt: mockRunGenerationAttempt,
}));

vi.mock('@/lib/api/auth', () => ({
  getEffectiveAuthUserId: mockGetEffectiveAuthUserId,
}));

vi.mock('@/lib/db/queries/users', () => ({
  getUserByAuthId: mockGetUserByAuthId,
}));

vi.mock('@/lib/db/runtime', () => ({
  getDb: mockGetDb,
}));

vi.mock('@/lib/stripe/usage', () => ({
  atomicCheckAndInsertPlan: mockAtomicCheckAndInsertPlan,
  markPlanGenerationSuccess: mockMarkPlanGenerationSuccess,
  markPlanGenerationFailure: mockMarkPlanGenerationFailure,
}));

vi.mock('@/lib/db/usage', () => ({
  recordUsage: mockRecordUsage,
}));

describe('generateLearningPlan', () => {
  const mockDb = { transaction: vi.fn() };
  const mockUser = { id: 'user-123' };
  const mockPlan = { id: 'plan-456' };

  const validParams: GenerateLearningPlanParams = {
    topic: 'TypeScript',
    skillLevel: 'beginner',
    learningStyle: 'mixed',
    weeklyHours: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(mockDb);
    mockGetEffectiveAuthUserId.mockResolvedValue('auth-user-123');
    mockGetUserByAuthId.mockResolvedValue(mockUser);
    mockAtomicCheckAndInsertPlan.mockResolvedValue(mockPlan);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authentication', () => {
    it('returns error when user is not authenticated', async () => {
      mockGetEffectiveAuthUserId.mockResolvedValue(null);

      const result = await generateLearningPlan(validParams);

      expect(result).toEqual({
        planId: '',
        status: 'failure',
        error: 'Unauthenticated.',
      });
    });

    it('returns error when user record is not found', async () => {
      mockGetUserByAuthId.mockResolvedValue(null);

      const result = await generateLearningPlan(validParams);

      expect(result).toEqual({
        planId: '',
        status: 'failure',
        error: 'User not found.',
      });
    });

    it('fetches user by auth ID', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan(validParams);

      expect(mockGetUserByAuthId).toHaveBeenCalledWith('auth-user-123');
    });
  });

  describe('plan creation', () => {
    it('creates plan with correct parameters', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan(validParams);

      expect(mockAtomicCheckAndInsertPlan).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          topic: 'TypeScript',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
          origin: 'ai',
        }),
        mockDb
      );
    });

    it('includes start date when provided', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        startDate: '2024-01-01',
      });

      expect(mockAtomicCheckAndInsertPlan).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          startDate: '2024-01-01',
        }),
        mockDb
      );
    });

    it('includes deadline date when provided', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        deadlineDate: '2024-12-31',
      });

      expect(mockAtomicCheckAndInsertPlan).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          deadlineDate: '2024-12-31',
        }),
        mockDb
      );
    });

    it('returns error when plan creation fails', async () => {
      mockAtomicCheckAndInsertPlan.mockRejectedValue(
        new Error('Database error')
      );

      const result = await generateLearningPlan(validParams);

      expect(result).toEqual({
        planId: '',
        status: 'failure',
        error: 'Database error',
      });
    });

    it('handles non-Error exceptions in plan creation', async () => {
      mockAtomicCheckAndInsertPlan.mockRejectedValue('Unknown error');

      const result = await generateLearningPlan(validParams);

      expect(result).toEqual({
        planId: '',
        status: 'failure',
        error: 'Failed to create plan.',
      });
    });
  });

  describe('generation', () => {
    it('calls runGenerationAttempt with correct parameters', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan(validParams);

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        {
          planId: 'plan-456',
          userId: 'user-123',
          input: {
            topic: 'TypeScript',
            notes: null,
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            startDate: null,
            deadlineDate: null,
          },
        },
        { dbClient: mockDb }
      );
    });

    it('includes notes when provided', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        notes: 'Focus on practical examples',
      });

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            notes: 'Focus on practical examples',
          }),
        }),
        { dbClient: mockDb }
      );
    });

    it('converts undefined notes to null', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        notes: undefined,
      });

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            notes: null,
          }),
        }),
        { dbClient: mockDb }
      );
    });

    it('converts null notes to null', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        notes: null,
      });

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            notes: null,
          }),
        }),
        { dbClient: mockDb }
      );
    });
  });

  describe('success handling', () => {
    it('marks plan as successful and returns success result', async () => {
      const mockModules = [
        {
          index: 0,
          title: 'Module 1',
          description: 'First module',
          estimatedMinutes: 120,
          tasks: [
            {
              index: 0,
              title: 'Task 1',
              description: 'First task',
              estimatedMinutes: 30,
              resources: [],
            },
          ],
        },
      ];

      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: mockModules,
        metadata: {
          provider: 'test-provider',
          model: 'test-model',
          usage: {
            promptTokens: 100,
            completionTokens: 500,
          },
        },
      });

      const result = await generateLearningPlan(validParams);

      expect(mockMarkPlanGenerationSuccess).toHaveBeenCalledWith(
        'plan-456',
        mockDb
      );
      expect(result).toEqual({
        planId: 'plan-456',
        status: 'success',
        modulesCount: 1,
        tasksCount: 1,
      });
    });

    it('records usage with correct parameters on success', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {
          provider: 'openrouter',
          model: 'claude-3',
          usage: {
            promptTokens: 150,
            completionTokens: 750,
          },
        },
      });

      await generateLearningPlan(validParams);

      expect(mockRecordUsage).toHaveBeenCalledWith({
        userId: 'user-123',
        provider: 'openrouter',
        model: 'claude-3',
        inputTokens: 150,
        outputTokens: 750,
        costCents: 0,
        kind: 'plan',
      });
    });

    it('handles missing usage metadata', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {
          provider: 'test-provider',
          model: 'test-model',
        },
      });

      await generateLearningPlan(validParams);

      expect(mockRecordUsage).toHaveBeenCalledWith({
        userId: 'user-123',
        provider: 'test-provider',
        model: 'test-model',
        inputTokens: undefined,
        outputTokens: undefined,
        costCents: 0,
        kind: 'plan',
      });
    });

    it('counts modules and tasks correctly', async () => {
      const mockModules = [
        {
          index: 0,
          title: 'Module 1',
          tasks: [{}, {}, {}],
        },
        {
          index: 1,
          title: 'Module 2',
          tasks: [{}, {}],
        },
      ];

      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: mockModules as any,
        metadata: {},
      });

      const result = await generateLearningPlan(validParams);

      expect(result).toEqual({
        planId: 'plan-456',
        status: 'success',
        modulesCount: 2,
        tasksCount: 5,
      });
    });
  });

  describe('failure handling', () => {
    it('marks plan as failed and returns failure result', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'failure',
        error: 'AI generation failed',
      });

      const result = await generateLearningPlan(validParams);

      expect(mockMarkPlanGenerationFailure).toHaveBeenCalledWith(
        'plan-456',
        mockDb
      );
      expect(result).toEqual({
        planId: 'plan-456',
        status: 'failure',
        error: 'AI generation failed',
      });
    });

    it('does not record usage on failure', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'failure',
        error: 'Generation failed',
      });

      await generateLearningPlan(validParams);

      expect(mockRecordUsage).not.toHaveBeenCalled();
    });

    it('handles Error object in failure', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'failure',
        error: new Error('Test error'),
      });

      const result = await generateLearningPlan(validParams);

      expect(result.error).toBe('Test error');
    });

    it('handles non-Error exception in failure', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'failure',
        error: { message: 'Custom error' },
      });

      const result = await generateLearningPlan(validParams);

      expect(result.error).toBe('Generation failed.');
    });

    it('handles string error', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'failure',
        error: 'Simple string error',
      });

      const result = await generateLearningPlan(validParams);

      expect(result.error).toBe('Simple string error');
    });
  });

  describe('different skill levels', () => {
    it('handles beginner skill level', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        skillLevel: 'beginner',
      });

      expect(mockAtomicCheckAndInsertPlan).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ skillLevel: 'beginner' }),
        mockDb
      );
    });

    it('handles intermediate skill level', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        skillLevel: 'intermediate',
      });

      expect(mockAtomicCheckAndInsertPlan).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ skillLevel: 'intermediate' }),
        mockDb
      );
    });

    it('handles advanced skill level', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        skillLevel: 'advanced',
      });

      expect(mockAtomicCheckAndInsertPlan).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ skillLevel: 'advanced' }),
        mockDb
      );
    });
  });

  describe('different learning styles', () => {
    it('handles reading learning style', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        learningStyle: 'reading',
      });

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ learningStyle: 'reading' }),
        }),
        { dbClient: mockDb }
      );
    });

    it('handles video learning style', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        learningStyle: 'video',
      });

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ learningStyle: 'video' }),
        }),
        { dbClient: mockDb }
      );
    });

    it('handles practice learning style', async () => {
      mockRunGenerationAttempt.mockResolvedValue({
        status: 'success',
        modules: [],
        metadata: {},
      });

      await generateLearningPlan({
        ...validParams,
        learningStyle: 'practice',
      });

      expect(mockRunGenerationAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ learningStyle: 'practice' }),
        }),
        { dbClient: mockDb }
      );
    });
  });
});