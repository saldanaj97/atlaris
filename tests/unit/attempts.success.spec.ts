import { describe, expect, it } from 'vitest';

import { recordSuccess, startAttempt } from '@/lib/db/queries/attempts';
import { hashSha256 } from '@/lib/utils/hash';

import {
  MockDbClient,
  asDbClient,
  createInput,
  createModules,
  createSequentialNow,
} from './helpers/attempts';

describe('attempt service – success path', () => {
  it('stores normalized modules, tasks, and attempt metadata', async () => {
    const mockDb = new MockDbClient();

    const now = createSequentialNow([
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2024-01-01T00:02:00.000Z'),
    ]);

    const input = createInput({ topic: 'Learning Figma' });
    const preparation = await startAttempt({
      planId: 'plan-1',
      userId: 'user-1',
      input,
      dbClient: asDbClient(mockDb),
      now,
    });

    const modulesInput = createModules();

    const attempt = await recordSuccess({
      planId: 'plan-1',
      preparation,
      modules: modulesInput,
      providerMetadata: {
        model: 'fake',
        provider: 'mock',
        usage: { totalTokens: 123 },
      },
      durationMs: 1234.6,
      extendedTimeout: true,
      dbClient: asDbClient(mockDb),
      now,
    });

    expect(mockDb.modules).toHaveLength(2);
    expect(mockDb.modules[0]).toMatchObject({
      planId: 'plan-1',
      order: 1,
      title: 'Module 1',
      estimatedMinutes: 15,
    });
    expect(mockDb.modules[1]).toMatchObject({
      planId: 'plan-1',
      order: 2,
      estimatedMinutes: 60,
    });

    expect(mockDb.tasks).toEqual([
      expect.objectContaining({
        moduleId: mockDb.modules[0].id,
        order: 1,
        estimatedMinutes: 5,
      }),
      expect.objectContaining({
        moduleId: mockDb.modules[1].id,
        order: 1,
        estimatedMinutes: 30,
      }),
    ]);

    expect(attempt.status).toBe('success');
    expect(attempt.modulesCount).toBe(2);
    expect(attempt.tasksCount).toBe(2);
    expect(attempt.promptHash).toBe(preparation.promptHash);
    expect(attempt.durationMs).toBe(1235);
    expect(attempt.normalizedEffort).toBe(true);
    expect(attempt.truncatedTopic).toBe(false);
    expect(attempt.truncatedNotes).toBe(false);

    const metadata = attempt.metadata as Record<string, any>;
    expect(metadata.provider).toEqual({
      model: 'fake',
      provider: 'mock',
      usage: { totalTokens: 123 },
    });
    expect(metadata.normalization).toEqual({
      modules_clamped: true,
      tasks_clamped: true,
    });
    expect(metadata.timing).toMatchObject({
      duration_ms: 120000,
      extended_timeout: true,
    });
    expect(metadata.input.topic).toEqual({
      truncated: false,
      original_length: input.topic.length,
    });

    const expectedHash = hashSha256(
      JSON.stringify({
        planId: 'plan-1',
        userId: 'user-1',
        topic: preparation.sanitized.topic.value,
        notes: preparation.sanitized.notes.value,
        skillLevel: input.skillLevel,
        weeklyHours: input.weeklyHours,
        learningStyle: input.learningStyle,
      })
    );
    expect(preparation.promptHash).toBe(expectedHash);
  });
});
