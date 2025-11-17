import { describe, it, expect } from 'vitest';
import {
  formatMinutes,
  formatWeeklyHours,
  formatSkillLevel,
  formatLearningStyle,
} from '@/lib/formatters';

describe('formatMinutes', () => {
  it('should return "—" for 0 minutes', () => {
    expect(formatMinutes(0)).toBe('—');
  });

  it('should format minutes less than 60', () => {
    expect(formatMinutes(30)).toBe('30 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(1)).toBe('1 min');
    expect(formatMinutes(59)).toBe('59 min');
  });

  it('should format exactly 1 hour', () => {
    expect(formatMinutes(60)).toBe('1 hr');
  });

  it('should format integer hours with plural', () => {
    expect(formatMinutes(120)).toBe('2 hrs');
    expect(formatMinutes(180)).toBe('3 hrs');
    expect(formatMinutes(240)).toBe('4 hrs');
  });

  it('should format non-integer hours with decimal', () => {
    expect(formatMinutes(90)).toBe('1.5 hrs');
    expect(formatMinutes(75)).toBe('1.2 hrs');
    expect(formatMinutes(150)).toBe('2.5 hrs');
  });

  it('should handle large values', () => {
    expect(formatMinutes(600)).toBe('10 hrs');
    expect(formatMinutes(1440)).toBe('24 hrs');
  });
});

describe('formatWeeklyHours', () => {
  it('should return default text for 0 hours', () => {
    expect(formatWeeklyHours(0)).toBe('a couple of hours');
  });

  it('should return default text for negative hours', () => {
    expect(formatWeeklyHours(-5)).toBe('a couple of hours');
  });

  it('should return default text for non-finite values', () => {
    expect(formatWeeklyHours(NaN)).toBe('a couple of hours');
    expect(formatWeeklyHours(Infinity)).toBe('a couple of hours');
    expect(formatWeeklyHours(-Infinity)).toBe('a couple of hours');
  });

  it('should format 1 hour as singular', () => {
    expect(formatWeeklyHours(1)).toBe('1 hour');
  });

  it('should format multiple hours as plural', () => {
    expect(formatWeeklyHours(2)).toBe('2 hours');
    expect(formatWeeklyHours(5)).toBe('5 hours');
    expect(formatWeeklyHours(10)).toBe('10 hours');
    expect(formatWeeklyHours(20)).toBe('20 hours');
  });

  it('should handle decimal hours', () => {
    expect(formatWeeklyHours(1.5)).toBe('1.5 hours');
    expect(formatWeeklyHours(2.5)).toBe('2.5 hours');
  });
});

describe('formatSkillLevel', () => {
  it('should format beginner', () => {
    expect(formatSkillLevel('beginner')).toBe('Beginner');
  });

  it('should format intermediate', () => {
    expect(formatSkillLevel('intermediate')).toBe('Intermediate');
  });

  it('should format advanced', () => {
    expect(formatSkillLevel('advanced')).toBe('Advanced');
  });

  it('should return input unchanged for unknown values', () => {
    expect(formatSkillLevel('expert')).toBe('expert');
    expect(formatSkillLevel('novice')).toBe('novice');
    expect(formatSkillLevel('')).toBe('');
  });

  it('should handle case sensitivity', () => {
    // Assumes input is lowercase - returns as-is if not matching
    expect(formatSkillLevel('Beginner')).toBe('Beginner');
    expect(formatSkillLevel('INTERMEDIATE')).toBe('INTERMEDIATE');
  });
});

describe('formatLearningStyle', () => {
  it('should format reading', () => {
    expect(formatLearningStyle('reading')).toBe('Reading');
  });

  it('should format video', () => {
    expect(formatLearningStyle('video')).toBe('Video');
  });

  it('should format practice', () => {
    expect(formatLearningStyle('practice')).toBe('Practice');
  });

  it('should format mixed', () => {
    expect(formatLearningStyle('mixed')).toBe('Mixed');
  });

  it('should return input unchanged for unknown values', () => {
    expect(formatLearningStyle('audio')).toBe('audio');
    expect(formatLearningStyle('interactive')).toBe('interactive');
    expect(formatLearningStyle('')).toBe('');
  });

  it('should handle case sensitivity', () => {
    // Assumes input is lowercase - returns as-is if not matching
    expect(formatLearningStyle('Reading')).toBe('Reading');
    expect(formatLearningStyle('VIDEO')).toBe('VIDEO');
  });
});
