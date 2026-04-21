import { describe, expect, it, vi } from 'vitest';
import {
  type ParseSsePlanEventHandlers,
  parseSsePlanEventLine,
} from '@/features/plans/session/parse-sse-plan-event';

function createHandlers(): ParseSsePlanEventHandlers {
  return {
    onValidationFailed: vi.fn(),
    onJsonError: vi.fn(),
  };
}

describe('parseSsePlanEventLine', () => {
  it('skips SSE comments and directives', () => {
    const handlers = createHandlers();

    expect(parseSsePlanEventLine(': keepalive', handlers)).toBeNull();
    expect(parseSsePlanEventLine('event: progress', handlers)).toBeNull();
    expect(parseSsePlanEventLine('id: 42', handlers)).toBeNull();
    expect(parseSsePlanEventLine('retry: 1000', handlers)).toBeNull();

    expect(handlers.onValidationFailed).not.toHaveBeenCalled();
    expect(handlers.onJsonError).not.toHaveBeenCalled();
  });

  it('parses data payloads', () => {
    const handlers = createHandlers();

    const event = parseSsePlanEventLine(
      'data: {"type":"plan_start","data":{"planId":"p1","attemptNumber":1,"topic":"t","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":null}}',
      handlers
    );

    expect(event?.type).toBe('plan_start');
    expect(handlers.onValidationFailed).not.toHaveBeenCalled();
    expect(handlers.onJsonError).not.toHaveBeenCalled();
  });
});
