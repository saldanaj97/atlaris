import { describe, expect, it } from 'vitest';

import type { PromptParams } from '@/lib/ai/prompts';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';

describe('Prompts with deadline and start date context', () => {
  it('includes start date in user prompt when provided', () => {
    const input: PromptParams = {
      topic: 'React Hooks',
      skillLevel: 'intermediate',
      learningStyle: 'mixed',
      weeklyHours: 5,
      startDate: '2025-01-15',
      deadlineDate: '2025-02-15',
    };

    const prompt = buildUserPrompt(input);

    expect(prompt).toContain('Start date: 2025-01-15');
    expect(prompt).toContain('Deadline: 2025-02-15');
  });

  it('omits start date line when not provided', () => {
    const input: PromptParams = {
      topic: 'React Hooks',
      skillLevel: 'intermediate',
      learningStyle: 'mixed',
      weeklyHours: 5,
      startDate: null,
      deadlineDate: '2025-02-15',
    };

    const prompt = buildUserPrompt(input);

    expect(prompt).not.toContain('Start date:');
    expect(prompt).toContain('Deadline: 2025-02-15');
  });

  it('omits deadline line when not provided', () => {
    const input: PromptParams = {
      topic: 'React Hooks',
      skillLevel: 'intermediate',
      learningStyle: 'mixed',
      weeklyHours: 5,
      startDate: '2025-01-15',
      deadlineDate: null,
    };

    const prompt = buildUserPrompt(input);

    expect(prompt).toContain('Start date: 2025-01-15');
    expect(prompt).not.toContain('Deadline:');
  });

  it('includes deadline constraint in system prompt', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain(
      'If start and deadline dates are provided, distribute learning to fit within the timeline'
    );
  });

  it('maintains other constraints in system prompt', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('3-6 modules total');
    expect(prompt).toContain('3-6 tasks');
    expect(prompt).toContain('JSON only');
  });

  it('includes all core fields in user prompt', () => {
    const input: PromptParams = {
      topic: 'Machine Learning Basics',
      skillLevel: 'beginner',
      learningStyle: 'video',
      weeklyHours: 10,
      startDate: '2025-03-01',
      deadlineDate: '2025-06-01',
    };

    const prompt = buildUserPrompt(input);

    expect(prompt).toContain('Topic: Machine Learning Basics');
    expect(prompt).toContain('Skill level: beginner');
    expect(prompt).toContain('Learning style: video');
    expect(prompt).toContain('Weekly hours: 10');
    expect(prompt).toContain('Start date: 2025-03-01');
    expect(prompt).toContain('Deadline: 2025-06-01');
  });
});
