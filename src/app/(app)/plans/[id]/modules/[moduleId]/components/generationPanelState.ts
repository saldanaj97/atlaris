import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

/**
 * What the panel can truthfully say: a run is in progress, or it failed.
 * The module page starts generation on its own when lessons are missing, so a
 * module that still has none and has no run going got there through a failed
 * start or a run that rolled back; it reads as failed, with a retry.
 */
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

/** Panel state for a module, or undefined once its lessons are ready. */
export function getModuleGenerationState(
  status: ModuleLessonGenerationSummary['status'],
  isPending: boolean,
): PanelState | undefined {
  return status === 'ready' ? undefined : getPanelState(status, isPending);
}

/** Empty-list copy that stays truthful when generation failed. */
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
