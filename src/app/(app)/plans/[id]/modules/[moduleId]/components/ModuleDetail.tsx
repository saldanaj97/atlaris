import type { JSX } from 'react';

import type { ModuleDetailReadModel } from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { ModuleDetailClient } from './ModuleDetailClient';

interface ModuleDetailProps {
  moduleData: ModuleDetailReadModel;
}

/**
 * Server-rendered module detail shell.
 * Delegates interactive progress updates to a shared client wrapper.
 */
export function ModuleDetail({ moduleData }: ModuleDetailProps): JSX.Element {
  const { module } = moduleData;
  const lessons = module.tasks;
  const initialStatuses: Record<string, ProgressStatus> = Object.fromEntries(
    lessons.map((lesson) => [lesson.id, lesson.status]),
  );

  return (
    <ModuleDetailClient
      moduleData={moduleData}
      initialStatuses={initialStatuses}
    />
  );
}
