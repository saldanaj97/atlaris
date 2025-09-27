import type { ParsedModule } from '@/lib/ai/parser';
import type { GenerationInput } from '@/lib/ai/provider';
import { generationAttempts, modules, tasks } from '@/lib/db/schema';

export type DbInstance = typeof import('@/lib/db/drizzle').db;

export class MockDbClient {
  existingAttempts = 0;
  modules: Array<Record<string, unknown>> = [];
  tasks: Array<Record<string, unknown>> = [];
  attempts: Array<Record<string, unknown>> = [];
  moduleIdCounter = 0;

  select() {
    return {
      from: () => ({
        where: async () => [{ value: this.existingAttempts }],
      }),
    };
  }

  async transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  delete(table: unknown) {
    if (table === modules) {
      return {
        where: async () => {
          this.modules = [];
          this.tasks = [];
        },
      };
    }

    throw new Error('Unsupported delete table in mock');
  }

  insert(table: unknown) {
    if (table === modules) {
      return {
        values: (row: any) => {
          const rows = Array.isArray(row) ? row : [row];
          const inserted = rows.map((value) => {
            const id = `module-${++this.moduleIdCounter}`;
            const record = { ...value, id };
            this.modules.push(record);
            return { id };
          });
          return {
            returning: async (columns?: { id: typeof modules.id }) => {
              if (columns?.id) {
                return inserted.map((entry) => ({ id: entry.id }));
              }
              return inserted;
            },
          };
        },
      };
    }

    if (table === tasks) {
      return {
        values: (row: any) => {
          const rows = Array.isArray(row) ? row : [row];
          rows.forEach((value) => {
            this.tasks.push({ ...value });
          });
          return {
            returning: async () => [],
          };
        },
      };
    }

    if (table === generationAttempts) {
      return {
        values: (row: any) => {
          const rows = Array.isArray(row) ? row : [row];
          const inserted = rows.map((value) => {
            const record = {
              ...value,
              id: `attempt-${this.attempts.length + 1}`,
            };
            this.attempts.push(record);
            this.existingAttempts = this.attempts.length;
            return record;
          });
          return {
            returning: async () => inserted,
          };
        },
      };
    }

    throw new Error('Unsupported insert table in mock');
  }
}

export function asDbClient(mock: MockDbClient): DbInstance {
  return mock as unknown as DbInstance;
}

export function createInput(
  overrides: Partial<GenerationInput> = {}
): GenerationInput {
  return {
    topic: 'Full stack web development',
    notes: 'Focus on TypeScript and testing best practices.',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    learningStyle: 'project-based',
    ...overrides,
  };
}

export function createModules(): ParsedModule[] {
  return [
    {
      title: 'Module 1',
      description: 'Intro',
      estimatedMinutes: 10,
      tasks: [
        {
          title: 'Task 1',
          description: 'Do thing',
          estimatedMinutes: 2,
        },
      ],
    },
    {
      title: 'Module 2',
      description: undefined,
      estimatedMinutes: 60,
      tasks: [
        {
          title: 'Task 2',
          description: undefined,
          estimatedMinutes: 30,
        },
      ],
    },
  ];
}

export function createSequentialNow(dates: Date[]): () => Date {
  let index = 0;
  return () => {
    const value = dates[Math.min(index, dates.length - 1)];
    if (index < dates.length - 1) {
      index += 1;
    }
    return value;
  };
}
