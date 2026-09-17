import type { ModuleStatus } from '@/app/(app)/plans/plans-progress-theme';

import { getTimelineConnectorClassName } from '@/app/(app)/plans/plans-progress-theme';
import { cn } from '@/lib/utils';

/** Connects a module marker to the next stop on the learning route. */
export function TimelineModuleConnector({ status }: { status: ModuleStatus }) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute top-[calc(50%+0.75rem)] bottom-[-1rem] left-8 z-0 w-px -translate-x-1/2 transition-[background-color] duration-500 ease-out motion-reduce:transition-none',
        getTimelineConnectorClassName(status),
      )}
    />
  );
}
