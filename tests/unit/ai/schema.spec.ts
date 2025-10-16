import { describe, it, expect } from 'vitest';
import { PlanSchema } from '@/lib/ai/schema';

describe('AI Plan Schema', () => {
  it('accepts a valid plan object', () => {
    const example = {
      modules: [
        {
          title: 'Intro',
          description: 'Basics',
          estimated_minutes: 120,
          tasks: [
            { title: 'Read docs', estimated_minutes: 30 },
            { title: 'Practice', description: 'Hands-on', estimated_minutes: 60 },
          ],
        },
      ],
    };
    const parsed = PlanSchema.parse(example);
    expect(parsed.modules.length).toBe(1);
    expect(parsed.modules[0].tasks.length).toBe(2);
  });

  it('rejects invalid estimated_minutes', () => {
    const invalid = {
      modules: [
        {
          title: 'Intro',
          estimated_minutes: -1,
          tasks: [{ title: 'Read', estimated_minutes: 10 }],
        },
      ],
    };
    expect(() => PlanSchema.parse(invalid)).toThrow();
  });
});

