import {
  activityEventTitle,
  formatCompactDuration,
  formatHourAxisTick,
} from '@/app/(app)/analytics/usage/usage-analytics-formatters';
import { describe, expect, it } from 'vitest';

describe('formatCompactDuration', () => {
  it('formats clock-style durations', () => {
    expect(formatCompactDuration(0)).toBe('0m');
    expect(formatCompactDuration(24)).toBe('24m');
    expect(formatCompactDuration(60)).toBe('1h');
    expect(formatCompactDuration(384)).toBe('6h 24m');
    expect(formatCompactDuration(-1)).toBe('—');
  });
});

describe('formatHourAxisTick', () => {
  it('labels minute values as hour ticks', () => {
    expect(formatHourAxisTick(0)).toBe('0');
    expect(formatHourAxisTick(60)).toBe('1h');
    expect(formatHourAxisTick(90)).toBe('1.5h');
  });
});

describe('activityEventTitle', () => {
  it('names recorded progress-status events without inventing study sessions', () => {
    expect(activityEventTitle('completed')).toBe('Completed a task');
    expect(activityEventTitle('in_progress')).toBe('Updated progress');
    expect(activityEventTitle('not_started')).toBe('Reset a task');
  });
});
