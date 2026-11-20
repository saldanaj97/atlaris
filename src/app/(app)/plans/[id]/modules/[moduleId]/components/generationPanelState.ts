import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

export type PanelState = 'failed' | 'running';

export function getPanelState(
  status: Exclude<ModuleLessonGenerationSummary['status'], 'ready'>,
  isPending: boolean,
): PanelState {
  switch (status) {
    case 'failed':
      return 'failed';
    case 'generating':
      return 'running';
    case 'not_generated':
      return isPending ? 'running' : 'failed';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getModuleGenerationState(
  status: ModuleLessonGenerationSummary['status'],
  isPending: boolean,
): PanelState | undefined {
  return status === 'ready' ? undefined : getPanelState(status, isPending);
}

export function getEmptyLessonsCopy(state: PanelState | undefined): {
  count: string;
  message: string;
} {
  return state === 'failed'
    ? {
        count: 'No lessons',
        message: 'No lessons were created for this module.',
      }
    : {
        count: 'No lessons yet',
        message: 'No lessons are available for this module yet.',
      };
}
