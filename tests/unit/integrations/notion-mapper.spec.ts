import { describe, it, expect } from 'vitest';
import {
  mapPlanToNotionBlocks,
  mapModuleToBlocks,
} from '@/lib/integrations/notion/mapper';
import type { LearningPlan, Module, Task } from '@/lib/types/db';

describe('Notion Data Mapper', () => {
  const mockPlan: Partial<LearningPlan> & { modules: Module[] } = {
    id: 'plan-123',
    topic: 'TypeScript Fundamentals',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    modules: [],
  };

  const mockModule: Module & { tasks: Task[] } = {
    id: 'module-1',
    planId: 'plan-123',
    title: 'Basic Types',
    description: 'Learn TypeScript basic types',
    order: 1,
    estimatedMinutes: 120,
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [
      {
        id: 'task-1',
        moduleId: 'module-1',
        title: 'Understand primitive types',
        description: 'Learn about string, number, boolean',
        order: 1,
        estimatedMinutes: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  it('should map plan to Notion page title and description', () => {
    const blocks = mapPlanToNotionBlocks(mockPlan as any);

    expect(blocks).toHaveLength(3); // Title, divider, weekly hours
    expect(blocks[0].type).toBe('heading_1');
    if (blocks[0].type === 'heading_1') {
      const richText = blocks[0].heading_1.rich_text[0];
      if (richText.type === 'text') {
        expect(richText.text.content).toBe('TypeScript Fundamentals');
      }
    }
    expect(blocks[1].type).toBe('divider');
    expect(blocks[2].type).toBe('callout');
    if (blocks[2].type === 'callout') {
      const richText = blocks[2].callout.rich_text[0];
      if (richText.type === 'text') {
        expect(richText.text.content).toContain('5 hours per week');
      }
    }
  });

  it('should map module to Notion heading and tasks', () => {
    const blocks = mapModuleToBlocks(mockModule);

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe('heading_2');
    if (blocks[0].type === 'heading_2') {
      const richText = blocks[0].heading_2.rich_text[0];
      if (richText.type === 'text') {
        expect(richText.text.content).toBe('Basic Types');
      }
    }

    // Should have task as to-do block
    const taskBlock = blocks.find((b) => b.type === 'to_do');
    expect(taskBlock).toBeDefined();
    if (taskBlock && taskBlock.type === 'to_do') {
      const richText = taskBlock.to_do.rich_text[0];
      if (richText.type === 'text') {
        expect(richText.text.content).toContain('Understand primitive types');
      }
    }
  });
});
