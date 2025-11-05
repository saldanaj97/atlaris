import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

interface LearningPlan {
  topic: string;
  skillLevel: string;
  weeklyHours: number;
}

interface Module {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  tasks: Task[];
}

interface Task {
  title: string;
  description: string | null;
  estimatedMinutes: number;
}

export function mapPlanToNotionBlocks(
  plan: LearningPlan
): BlockObjectRequest[] {
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

export function mapModuleToBlocks(module: Module): BlockObjectRequest[] {
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

  // Tasks as to-do items
  module.tasks.forEach((task) => {
    blocks.push({
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
    });

    // Task description as nested paragraph
    if (task.description) {
      blocks.push({
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: task.description } }],
          color: 'gray',
        },
      });
    }
  });

  return blocks;
}

export function mapFullPlanToBlocks(
  plan: LearningPlan & { modules: Module[] }
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
