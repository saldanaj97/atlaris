import { describe, expect, it } from 'vitest';
import { planSchedules } from '@/lib/db/schema';

describe('Plan Schedules Schema', () => {
  it('should have plan_schedules table defined', () => {
    expect(planSchedules).toBeDefined();
  });

  it('should have correct column structure', () => {
    const columns = Object.keys(planSchedules);
    expect(columns).toContain('planId');
    expect(columns).toContain('scheduleJson');
    expect(columns).toContain('inputsHash');
    expect(columns).toContain('generatedAt');
    expect(columns).toContain('timezone');
    expect(columns).toContain('weeklyHours');
    expect(columns).toContain('startDate');
    expect(columns).toContain('deadline');
  });
});
