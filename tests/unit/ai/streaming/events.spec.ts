import { describe, expect, it } from 'vitest';

import { createEventStream, formatEvent } from '@/lib/ai/streaming/events';
import type { PlanStartEvent } from '@/lib/ai/streaming/types';

const decoder = new TextDecoder();

describe('streaming events', () => {
  it('formats events as SSE chunks', () => {
    const event: PlanStartEvent = {
      type: 'plan_start',
      data: {
        planId: 'plan-123',
        topic: 'TypeScript',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: 5,
        startDate: null,
        deadlineDate: '2030-01-01',
      },
    };

    const chunk = formatEvent(event);
    expect(decoder.decode(chunk)).toBe(`data: ${JSON.stringify(event)}\n\n`);
  });

  it('streams events through createEventStream', async () => {
    const event = {
      type: 'complete',
      data: {
        planId: 'plan-123',
        modulesCount: 2,
        tasksCount: 6,
        durationMs: 1234,
      },
    } as const;

    const stream = createEventStream((emit) => {
      emit(event);
    });

    const reader = stream.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(decoder.decode(value)).toContain('"type":"complete"');
  });
});
