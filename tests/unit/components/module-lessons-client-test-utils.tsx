import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import { ModuleLessonsClient } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import { render } from '@testing-library/react';
import { createId } from '@tests/fixtures/ids';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

export const PLAN_ID = randomUUID();
export const MODULE_ID = randomUUID();
export const NEXT_MODULE_ID = randomUUID();
export const GENERATE_URL = `/api/v1/plans/${PLAN_ID}/modules/${MODULE_ID}/lesson-content/generate`;
export const STATUS_URL = `/api/v1/plans/${PLAN_ID}/modules/${MODULE_ID}/lesson-content/status`;

export const lesson: ModuleDetailTask = {
  id: createId('task'),
  order: 1,
  title: 'First lesson',
  description: null,
  estimatedMinutes: 10,
  status: 'not_started',
  lessonContent: null,
  lessonContentUpdatedAt: null,
  resources: [],
};

export function mockJsonFetchResponse(
  body: unknown,
  options?: { ok?: boolean; status?: number },
): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  const status = options?.status ?? 200;
  const ok = options?.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

type ClientPropOverrides = Partial<
  Pick<
    Parameters<typeof ModuleLessonsClient>[0],
    | 'lessons'
    | 'previousModulesComplete'
    | 'lessonGeneration'
    | 'planId'
    | 'moduleId'
    | 'statuses'
  >
>;

export function clientProps(
  options: ClientPropOverrides = {},
): Parameters<typeof ModuleLessonsClient>[0] {
  return {
    planId: options.planId ?? PLAN_ID,
    moduleId: options.moduleId ?? MODULE_ID,
    lessons: options.lessons ?? [lesson],
    nextModuleId: null,
    previousModulesComplete: options.previousModulesComplete ?? true,
    statuses: options.statuses ?? {},
    onStatusChange: vi.fn(),
    lessonGeneration: options.lessonGeneration ?? {
      status: 'not_generated',
      startedAt: null,
      completedAt: null,
      failedAt: null,
      error: null,
    },
  };
}

export function renderClient(options: ClientPropOverrides = {}) {
  return render(<ModuleLessonsClient {...clientProps(options)} />);
}
