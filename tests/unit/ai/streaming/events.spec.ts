import { describe, expect, it } from 'vitest';

import { createEventStream, formatEvent } from '@/features/ai/streaming/events';
import { StreamingEventSchema } from '@/features/ai/streaming/schema';
import type {
  PlanGenerationSessionEvent,
  PlanStartEvent,
} from '@/features/plans/session/session-events';

const decoder = new TextDecoder();

describe('streaming events', () => {
  it('formats events as SSE chunks', () => {
    const event: PlanStartEvent = {
      type: 'plan_start',
      data: {
        planId: 'plan-123',
        attemptNumber: 1,
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

  it('keeps the streaming schema aligned with session events', () => {
    const parsed = StreamingEventSchema.parse({
      type: 'plan_start',
      data: {
        planId: 'plan-123',
        attemptNumber: 1,
        topic: 'TypeScript',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: 5,
        startDate: null,
        deadlineDate: null,
      },
    });

    const event: PlanGenerationSessionEvent = parsed;
    expect(event.type).toBe('plan_start');
  });

  it('streams events through createEventStream', async () => {
    const event = {
      type: 'complete',
      data: {
        planId: 'plan-123',
        modulesCount: 2,
        tasksCount: 6,
        totalMinutes: 180,
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

  it('invokes cancellation handlers when reader cancels stream', async () => {
    let cancelCalled = false;
    let markReady: (() => void) | null = null;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });

    const stream = createEventStream(async (_emit, _controller, context) => {
      context.onCancel(() => {
        cancelCalled = true;
      });
      markReady?.();

      await new Promise(() => {
        // Never resolves; test cancels reader.
      });
    });

    const reader = stream.getReader();
    const firstRead = reader.read();
    await ready;
    await reader.cancel();
    await firstRead.catch(() => undefined);

    expect(cancelCalled).toBe(true);
  });
});
