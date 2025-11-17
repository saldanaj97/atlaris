/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  normalizeOnboardingValues,
  mapOnboardingToCreateInput,
  weeklyHoursRangeLabel,
} from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';

describe('normalizeOnboardingValues', () => {
  it('should normalize valid onboarding form values', () => {
    const values: OnboardingFormValues = {
      topic: 'TypeScript',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: '3-5',
      startDate: '2026-01-01',
      deadlineDate: '2026-03-01',
      notes: undefined,
      notes: 'Test notes',
    };

    const result = normalizeOnboardingValues(values);

    expect(result.topic).toBe('TypeScript');
    expect(result.skillLevel).toBe('beginner');
    expect(result.learningStyle).toBe('mixed');
    expect(result.weeklyHours).toBe(5);
    expect(result.startDate).toBe('2026-01-01');
    expect(result.deadlineDate).toBe('2026-03-01');
    expect(result.notes).toBe('Test notes');
  });

  it('should normalize skill levels to lowercase', () => {
    const values: OnboardingFormValues = {
      topic: 'Python',
      skillLevel: 'INTERMEDIATE',
      learningStyle: 'mixed',
      weeklyHours: '6-10',
      deadlineDate: '2026-03-01',
      notes: undefined,
    };

    const result = normalizeOnboardingValues(values);
    expect(result.skillLevel).toBe('intermediate');
  });

  it('should normalize learning style variations', () => {
    const values: OnboardingFormValues = {
      topic: 'JavaScript',
      skillLevel: 'beginner',
      learningStyle: 'hands-on',
      weeklyHours: '1-2',
      deadlineDate: '2026-03-01',
      notes: undefined,
    };

    const result = normalizeOnboardingValues(values);
    expect(result.learningStyle).toBe('practice');
  });

  it('should parse weekly hours ranges', () => {
    expect(
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: '1-2',
        deadlineDate: '2026-03-01',
        notes: undefined,
      }).weeklyHours
    ).toBe(2);

    expect(
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: '3-5',
        deadlineDate: '2026-03-01',
        notes: undefined,
      }).weeklyHours
    ).toBe(5);

    expect(
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: '6-10',
        deadlineDate: '2026-03-01',
        notes: undefined,
      }).weeklyHours
    ).toBe(10);

    expect(
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: '11-15',
        deadlineDate: '2026-03-01',
        notes: undefined,
      }).weeklyHours
    ).toBe(15);

    expect(
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: '16-20',
        deadlineDate: '2026-03-01',
        notes: undefined,
      }).weeklyHours
    ).toBe(20);

    expect(
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: '20+',
        deadlineDate: '2026-03-01',
        notes: undefined,
      }).weeklyHours
    ).toBe(25);
  });

  it('should parse numeric weekly hours strings', () => {
    const result = normalizeOnboardingValues({
      topic: 'Test',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: '8',
      deadlineDate: '2026-03-01',
      notes: undefined,
    });

    expect(result.weeklyHours).toBe(8);
  });

  it('should handle numeric weekly hours directly', () => {
    const result = normalizeOnboardingValues({
      topic: 'Test',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: 12,
      deadlineDate: '2026-03-01',
      notes: undefined,
    });

    expect(result.weeklyHours).toBe(12);
  });

  it('should throw error for invalid skill level', () => {
    expect(() =>
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'invalid-level',
        learningStyle: 'mixed',
        weeklyHours: '3-5',
        deadlineDate: '2026-03-01',
        notes: undefined,
      })
    ).toThrow('Unsupported skill level');
  });

  it('should throw error for invalid learning style', () => {
    expect(() =>
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'invalid-style',
        weeklyHours: '3-5',
        deadlineDate: '2026-03-01',
        notes: undefined,
      })
    ).toThrow('Unsupported learning style');
  });

  it('should throw error for invalid weekly hours', () => {
    expect(() =>
      normalizeOnboardingValues({
        topic: 'Test',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: 'invalid',
        deadlineDate: '2026-03-01',
        notes: undefined,
      })
    ).toThrow('Unable to parse weekly hours');
  });

  it('should handle optional fields', () => {
    const result = normalizeOnboardingValues({
      topic: 'Test',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: '3-5',
      deadlineDate: '2026-03-01',
      notes: undefined,
    });

    expect(result.startDate).toBeUndefined();
    expect(result.notes).toBeUndefined();
  });
});

describe('mapOnboardingToCreateInput', () => {
  it('should map onboarding values to create input with defaults', () => {
    const values: OnboardingFormValues = {
      topic: 'React',
      skillLevel: 'intermediate',
      learningStyle: 'mixed',
      weeklyHours: '6-10',
      deadlineDate: '2026-06-01',
    };

    const result = mapOnboardingToCreateInput(values);

    expect(result.topic).toBe('React');
    expect(result.skillLevel).toBe('intermediate');
    expect(result.learningStyle).toBe('mixed');
    expect(result.weeklyHours).toBe(10);
    expect(result.startDate).toBeDefined(); // Should default to today
    expect(result.deadlineDate).toBe('2026-06-01');
    expect(result.visibility).toBe('private');
    expect(result.origin).toBe('ai');
  });

  it('should preserve explicit startDate', () => {
    const values: OnboardingFormValues = {
      topic: 'Vue',
      skillLevel: 'beginner',
      learningStyle: 'reading',
      weeklyHours: '3-5',
      startDate: '2026-02-15',
      deadlineDate: '2026-05-15',
      notes: undefined,
    };

    const result = mapOnboardingToCreateInput(values);

    expect(result.startDate).toBe('2026-02-15');
  });

  it('should default startDate to today when not provided', () => {
    const values: OnboardingFormValues = {
      topic: 'Angular',
      skillLevel: 'advanced',
      learningStyle: 'practice',
      weeklyHours: '11-15',
      deadlineDate: '2026-08-01',
      notes: undefined,
    };

    const result = mapOnboardingToCreateInput(values);

    // Should be a valid date string in YYYY-MM-DD format
    expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should always set visibility to private', () => {
    const values: OnboardingFormValues = {
      topic: 'Test',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: '3-5',
      deadlineDate: '2026-03-01',
      notes: undefined,
    };

    const result = mapOnboardingToCreateInput(values);
    expect(result.visibility).toBe('private');
  });

  it('should always set origin to ai', () => {
    const values: OnboardingFormValues = {
      topic: 'Test',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: '3-5',
      deadlineDate: '2026-03-01',
      notes: undefined,
    };

    const result = mapOnboardingToCreateInput(values);
    expect(result.origin).toBe('ai');
  });

  it('should include notes when provided', () => {
    const values: OnboardingFormValues = {
      topic: 'Node.js',
      skillLevel: 'intermediate',
      learningStyle: 'mixed',
      weeklyHours: '6-10',
      deadlineDate: '2026-04-01',
      notes: 'Focus on async patterns',
    };

    const result = mapOnboardingToCreateInput(values);
    expect(result.notes).toBe('Focus on async patterns');
  });
});

describe('weeklyHoursRangeLabel', () => {
  it('should return correct label for hours <= 2', () => {
    expect(weeklyHoursRangeLabel(1)).toBe('1-2');
    expect(weeklyHoursRangeLabel(2)).toBe('1-2');
  });

  it('should return correct label for hours 3-5', () => {
    expect(weeklyHoursRangeLabel(3)).toBe('3-5');
    expect(weeklyHoursRangeLabel(4)).toBe('3-5');
    expect(weeklyHoursRangeLabel(5)).toBe('3-5');
  });

  it('should return correct label for hours 6-10', () => {
    expect(weeklyHoursRangeLabel(6)).toBe('6-10');
    expect(weeklyHoursRangeLabel(8)).toBe('6-10');
    expect(weeklyHoursRangeLabel(10)).toBe('6-10');
  });

  it('should return correct label for hours 11-15', () => {
    expect(weeklyHoursRangeLabel(11)).toBe('11-15');
    expect(weeklyHoursRangeLabel(13)).toBe('11-15');
    expect(weeklyHoursRangeLabel(15)).toBe('11-15');
  });

  it('should return correct label for hours 16-20', () => {
    expect(weeklyHoursRangeLabel(16)).toBe('16-20');
    expect(weeklyHoursRangeLabel(18)).toBe('16-20');
    expect(weeklyHoursRangeLabel(20)).toBe('16-20');
  });

  it('should return correct label for hours > 20', () => {
    expect(weeklyHoursRangeLabel(21)).toBe('20+');
    expect(weeklyHoursRangeLabel(25)).toBe('20+');
    expect(weeklyHoursRangeLabel(100)).toBe('20+');
  });

  it('should handle edge cases', () => {
    expect(weeklyHoursRangeLabel(0)).toBe('1-2');
    expect(weeklyHoursRangeLabel(0.5)).toBe('1-2');
  });
});
