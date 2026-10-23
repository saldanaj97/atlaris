import type {
  FreeRouterNotice,
  PlanRegenerationState,
} from '@/app/(app)/plans/[id]/types';

import { GenerationAlertPanel } from './generation-alert-panel';

/** Names the content the free router generated, as the sentence subject. */
export function describeFreeRouterContent(notice: FreeRouterNotice): string {
  const lessons =
    notice.lessonModuleCount === 1
      ? 'lessons in 1 module'
      : `lessons in ${notice.lessonModuleCount} modules`;
  if (notice.outline && notice.lessonModuleCount > 0) {
    return `This plan and ${lessons} were`;
  }
  if (notice.outline) {
    return 'This plan was';
  }
  return `${lessons.charAt(0).toUpperCase()}${lessons.slice(1)} were`;
}

/**
 * Tells a paid user that some of the plan ran on the free router because
 * their paid model was unavailable (DEV-175). Regeneration is mentioned only
 * when the page offers it.
 */
export function FreeRouterFallbackNotice({
  notice,
  regeneration,
}: {
  notice: FreeRouterNotice;
  regeneration?: PlanRegenerationState;
}) {
  const canRegenerate =
    regeneration?.canRegenerate === true && !regeneration.isRegenerating;
  return (
    <output className='mt-6 block'>
      <GenerationAlertPanel
        variant='warning'
        title='Generated with a free backup model'
        body={`${describeFreeRouterContent(notice)} generated with a free backup model because your paid model was unavailable.${
          canRegenerate
            ? ' You can regenerate the plan to try your paid model again.'
            : ''
        }`}
      />
    </output>
  );
}
