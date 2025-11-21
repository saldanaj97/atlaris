import type { BlockObjectRequest } from './types';
import type { LearningPlan, Module, Task } from '@/lib/types/db';

type MinimalPlan = Pick<LearningPlan, 'topic' | 'skillLevel' | 'weeklyHours'>;
type MinimalTask = Pick<Task, 'title' | 'description' | 'estimatedMinutes'>;
type MinimalModule = Pick<
  Module,
  'title' | 'description' | 'estimatedMinutes'
> & {
  tasks: MinimalTask[];
};

export function mapPlanToNotionBlocks(plan: MinimalPlan): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  // Title
  blocks.push({
    type: 'heading_1',
    heading_1: {
      rich_text: [{ type: 'text', text: { content: plan.topic } }],
      color: 'default',
    },
  });

  // Divider
  blocks.push({ type: 'divider', divider: {} });

  // Weekly hours callout
  blocks.push({
    type: 'callout',
    callout: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `📅 ${plan.weeklyHours} hours per week | Skill level: ${plan.skillLevel}`,
          },
        },
      ],
      icon: { type: 'emoji', emoji: '📚' },
      color: 'blue_background',
    },
  });

  return blocks;
}

export function mapModuleToBlocks(module: MinimalModule): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  // Module heading
  blocks.push({
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: module.title } }],
      color: 'default',
    },
  });

  // Module description
  if (module.description) {
    blocks.push({
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: module.description },
            annotations: { italic: true },
          },
        ],
        color: 'default',
      },
    });
  }

  // Estimated time
  blocks.push({
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `⏱️ Estimated time: ${module.estimatedMinutes} minutes`,
          },
          annotations: { bold: true },
        },
      ],
      color: 'default',
    },
  });

  // Tasks as to-do items with optional nested description
  module.tasks.forEach((task) => {
    const todoBlock: BlockObjectRequest = {
      type: 'to_do',
      to_do: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `${task.title} (${task.estimatedMinutes} min)`,
            },
          },
        ],
        checked: false,
        color: 'default',
      },
      ...(task.description
        ? {
            children: [
              {
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    { type: 'text', text: { content: task.description } },
                  ],
                  color: 'gray',
                },
              },
            ],
          }
        : {}),
    };

    blocks.push(todoBlock);
  });

  return blocks;
}

export function mapFullPlanToBlocks(
  plan: MinimalPlan & { modules: MinimalModule[] }
): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];

  // Add plan header
  blocks.push(...mapPlanToNotionBlocks(plan));

  // Add each module
  plan.modules.forEach((module, index) => {
    if (index > 0) {
      blocks.push({ type: 'divider', divider: {} });
    }
    blocks.push(...mapModuleToBlocks(module));
  });

  return blocks;
}
