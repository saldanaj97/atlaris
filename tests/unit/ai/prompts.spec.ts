import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
  type PromptParams,
  type MicroExplanationPromptParams,
} from '@/lib/ai/prompts';

describe('AI Prompt Builder', () => {
  describe('buildSystemPrompt', () => {
    it('should return a non-empty string', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include JSON schema instructions', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('modules');
      expect(prompt).toContain('Module');
      expect(prompt).toContain('Task');
      expect(prompt).toContain('Resource');
    });

    it('should include required fields for Module', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('title');
      expect(prompt).toContain('description');
      expect(prompt).toContain('estimated_minutes');
      expect(prompt).toContain('tasks');
    });

    it('should include required fields for Task', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('title');
      expect(prompt).toContain('estimated_minutes');
      expect(prompt).toContain('resources');
    });

    it('should include required fields for Resource', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('url');
      expect(prompt).toContain('type');
      expect(prompt).toContain('youtube');
      expect(prompt).toContain('article');
    });

    it('should specify module count constraints', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('3-6 modules');
    });

    it('should specify task count constraints', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('3-6 tasks');
    });

    it('should include time estimate guidelines', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('Time Estimate Guidelines');
      expect(prompt).toContain('Beginner');
      expect(prompt).toContain('Intermediate');
      expect(prompt).toContain('Advanced');
    });

    it('should include resource requirements', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('Resource Requirements');
      expect(prompt).toContain('at least one linked resource');
    });

    it('should prohibit markdown and code fences', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('NOT include markdown');
      expect(prompt).toContain('code fences');
    });

    it('should emphasize JSON-only output', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('JSON only');
      expect(prompt).toContain('strictly JSON');
    });
  });

  describe('buildUserPrompt', () => {
    const basicParams: PromptParams = {
      topic: 'TypeScript',
      skillLevel: 'intermediate',
      learningStyle: 'mixed',
      weeklyHours: 10,
    };

    it('should include all required parameters', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('intermediate');
      expect(prompt).toContain('mixed');
      expect(prompt).toContain('10');
    });

    it('should format topic correctly', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).toContain('Topic: TypeScript');
    });

    it('should format skill level correctly', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).toContain('Skill level: intermediate');
    });

    it('should format learning style correctly', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).toContain('Learning style: mixed');
    });

    it('should format weekly hours correctly', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).toContain('Weekly hours: 10');
    });

    it('should include start date when provided', () => {
      const params: PromptParams = {
        ...basicParams,
        startDate: '2024-01-01',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Start date: 2024-01-01');
    });

    it('should include deadline when provided', () => {
      const params: PromptParams = {
        ...basicParams,
        deadlineDate: '2024-12-31',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Deadline: 2024-12-31');
    });

    it('should omit start date when not provided', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).not.toContain('Start date:');
    });

    it('should omit deadline when not provided', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).not.toContain('Deadline:');
    });

    it('should include both start date and deadline when both provided', () => {
      const params: PromptParams = {
        ...basicParams,
        startDate: '2024-01-01',
        deadlineDate: '2024-12-31',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Start date: 2024-01-01');
      expect(prompt).toContain('Deadline: 2024-12-31');
    });

    it('should request JSON output', () => {
      const prompt = buildUserPrompt(basicParams);

      expect(prompt).toContain('JSON');
    });

    it('should handle beginner skill level', () => {
      const params: PromptParams = {
        ...basicParams,
        skillLevel: 'beginner',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Skill level: beginner');
    });

    it('should handle advanced skill level', () => {
      const params: PromptParams = {
        ...basicParams,
        skillLevel: 'advanced',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Skill level: advanced');
    });

    it('should handle reading learning style', () => {
      const params: PromptParams = {
        ...basicParams,
        learningStyle: 'reading',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Learning style: reading');
    });

    it('should handle video learning style', () => {
      const params: PromptParams = {
        ...basicParams,
        learningStyle: 'video',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Learning style: video');
    });

    it('should handle practice learning style', () => {
      const params: PromptParams = {
        ...basicParams,
        learningStyle: 'practice',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Learning style: practice');
    });

    it('should handle different weekly hour amounts', () => {
      const params1: PromptParams = { ...basicParams, weeklyHours: 5 };
      const params2: PromptParams = { ...basicParams, weeklyHours: 20 };

      expect(buildUserPrompt(params1)).toContain('Weekly hours: 5');
      expect(buildUserPrompt(params2)).toContain('Weekly hours: 20');
    });

    it('should handle complex topic names', () => {
      const params: PromptParams = {
        ...basicParams,
        topic: 'Advanced React Hooks and State Management with TypeScript',
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('Topic: Advanced React Hooks and State Management with TypeScript');
    });

    it('should handle null start date', () => {
      const params: PromptParams = {
        ...basicParams,
        startDate: null,
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).not.toContain('Start date:');
    });

    it('should handle null deadline date', () => {
      const params: PromptParams = {
        ...basicParams,
        deadlineDate: null,
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).not.toContain('Deadline:');
    });
  });

  describe('buildMicroExplanationSystemPrompt', () => {
    it('should return a non-empty string', () => {
      const prompt = buildMicroExplanationSystemPrompt();

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include JSON structure instructions', () => {
      const prompt = buildMicroExplanationSystemPrompt();

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('explanation');
      expect(prompt).toContain('practice');
    });

    it('should include conciseness guidelines', () => {
      const prompt = buildMicroExplanationSystemPrompt();

      expect(prompt).toContain('concise');
      expect(prompt).toContain('2-3 sentences');
    });

    it('should emphasize clear language', () => {
      const prompt = buildMicroExplanationSystemPrompt();

      expect(prompt).toContain('clear');
      expect(prompt).toContain('accessible');
    });

    it('should mention skill level adaptation', () => {
      const prompt = buildMicroExplanationSystemPrompt();

      expect(prompt).toContain('skill level');
    });
  });

  describe('buildMicroExplanationUserPrompt', () => {
    const basicParams: MicroExplanationPromptParams = {
      topic: 'React Hooks',
      taskTitle: 'Understanding useState',
      skillLevel: 'beginner',
    };

    it('should include topic and task title', () => {
      const prompt = buildMicroExplanationUserPrompt(basicParams);

      expect(prompt).toContain('React Hooks');
      expect(prompt).toContain('Understanding useState');
    });

    it('should include skill level', () => {
      const prompt = buildMicroExplanationUserPrompt(basicParams);

      expect(prompt).toContain('beginner');
    });

    it('should include module title when provided', () => {
      const params: MicroExplanationPromptParams = {
        ...basicParams,
        moduleTitle: 'Fundamentals of React',
      };

      const prompt = buildMicroExplanationUserPrompt(params);

      expect(prompt).toContain('Fundamentals of React');
    });

    it('should work without module title', () => {
      const prompt = buildMicroExplanationUserPrompt(basicParams);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should handle different skill levels', () => {
      const beginner = buildMicroExplanationUserPrompt({ ...basicParams, skillLevel: 'beginner' });
      const intermediate = buildMicroExplanationUserPrompt({ ...basicParams, skillLevel: 'intermediate' });
      const advanced = buildMicroExplanationUserPrompt({ ...basicParams, skillLevel: 'advanced' });

      expect(beginner).toContain('beginner');
      expect(intermediate).toContain('intermediate');
      expect(advanced).toContain('advanced');
    });
  });

  describe('Prompt Input Sanitization', () => {
    it('should handle topic with special characters', () => {
      const params: PromptParams = {
        topic: 'C++ & C# <Programming>',
        skillLevel: 'intermediate',
        learningStyle: 'mixed',
        weeklyHours: 10,
      };

      const prompt = buildUserPrompt(params);

      // Should include the topic without modification
      expect(prompt).toContain('C++ & C# <Programming>');
    });

    it('should handle topic with quotes', () => {
      const params: PromptParams = {
        topic: 'Learning "Design Patterns"',
        skillLevel: 'intermediate',
        learningStyle: 'mixed',
        weeklyHours: 10,
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('"Design Patterns"');
    });

    it('should handle topic with newlines', () => {
      const params: PromptParams = {
        topic: 'TypeScript\nAdvanced Concepts',
        skillLevel: 'intermediate',
        learningStyle: 'mixed',
        weeklyHours: 10,
      };

      const prompt = buildUserPrompt(params);

      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('Advanced Concepts');
    });
  });
});
