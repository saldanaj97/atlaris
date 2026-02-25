import type { JSX } from 'react';

import type { ModuleDetail as ModuleDetailData } from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus } from '@/lib/types/db';

import { ModuleDetailClient } from './ModuleDetailClient';

interface ModuleDetailProps {
  moduleData: ModuleDetailData;
}

/**
 * Server-rendered module detail shell.
 * Delegates interactive progress updates to a shared client wrapper.
 */
export function ModuleDetail({ moduleData }: ModuleDetailProps): JSX.Element {
  const { module } = moduleData;
  const lessons = module.tasks ?? [];
  const initialStatuses: Record<string, ProgressStatus> = Object.fromEntries(
    lessons.map((lesson) => [
      lesson.id,
      lesson.progress?.status ?? 'not_started',
    ])
  );

  return (
    <ModuleDetailClient
      moduleData={moduleData}
      initialStatuses={initialStatuses}
    />
  );
}
