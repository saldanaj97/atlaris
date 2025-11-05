## Task 7: Notion Integration - Plan-to-Notion Data Mapper

**Files:**

- Create: `src/lib/integrations/notion/mapper.ts`
- Create: `tests/unit/integrations/notion-mapper.spec.ts`

**Step 1: Write failing test for plan-to-Notion mapping**

Create `tests/unit/integrations/notion-mapper.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  mapPlanToNotionBlocks,
  mapModuleToBlocks,
} from '@/lib/integrations/notion/mapper';
import type { LearningPlan, Module, Task } from '@/lib/db/schema';

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
        durationMinutes: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  it('should map plan to Notion page title and description', () => {
    const blocks = mapPlanToNotionBlocks(mockPlan as any);

    expect(blocks).toHaveLength(3); // Title, divider, weekly hours
    expect(blocks[0].type).toBe('heading_1');
    expect(blocks[0].heading_1.rich_text[0].text.content).toBe(
      'TypeScript Fundamentals'
    );
    expect(blocks[1].type).toBe('divider');
    expect(blocks[2].type).toBe('callout');
    expect(blocks[2].callout.rich_text[0].text.content).toContain(
      '5 hours per week'
    );
  });

  it('should map module to Notion heading and tasks', () => {
    const blocks = mapModuleToBlocks(mockModule);

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe('heading_2');
    expect(blocks[0].heading_2.rich_text[0].text.content).toBe('Basic Types');

    // Should have task as to-do block
    const taskBlock = blocks.find((b) => b.type === 'to_do');
    expect(taskBlock).toBeDefined();
    expect(taskBlock.to_do.rich_text[0].text.content).toContain(
      'Understand primitive types'
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-mapper.spec.ts
```

Expected: FAIL - Module not found

**Step 3: Implement mapper functions**

Create `src/lib/integrations/notion/mapper.ts`:

```typescript
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
  durationMinutes: number;
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
            text: { content: `${task.title} (${task.durationMinutes} min)` },
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
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-mapper.spec.ts
```

Expected: PASS

**Step 5: Install Notion SDK**

Run:

```bash
pnpm add @notionhq/client
```

Expected: Package installed successfully

**Step 6: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 7: Commit**

```bash
git add src/lib/integrations/notion/mapper.ts tests/unit/integrations/notion-mapper.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(notion): add plan-to-Notion block mapper

Implement data mapping from learning plan structure to Notion API blocks.
Maps modules to headings, tasks to to-do items, and plan metadata to
callouts.

Changes:
- Add mapPlanToNotionBlocks for plan header
- Add mapModuleToBlocks for module sections
- Add mapFullPlanToBlocks for complete plan export
- Install @notionhq/client SDK

New files:
- src/lib/integrations/notion/mapper.ts
- tests/unit/integrations/notion-mapper.spec.ts

Tests cover:
- Plan header with title and weekly hours
- Module sections with tasks as to-dos"
```

**Step 8: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
