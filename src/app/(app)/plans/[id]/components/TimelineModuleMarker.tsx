import {
  getTimelineMarkerClassName,
  type ModuleStatus,
} from '@/app/(app)/plans/plans-progress-theme';
import { cn } from '@/lib/utils';
import { CheckCircle2, Lock } from 'lucide-react';

export function TimelineModuleMarker({ status }: { status: ModuleStatus }) {
  const statusLabel =
    status === 'completed'
      ? 'Module completed'
      : status === 'active'
        ? 'Module available'
        : 'Module locked';

  return (
    <div
      data-state={status}
      className={cn(
        'z-10 flex size-6 items-center justify-center rounded-full border-[3px] bg-panel transition-[border-color,background-color,box-shadow] duration-500 ease-out',
        getTimelineMarkerClassName(status),
      )}
    >
      <span className='sr-only'>{statusLabel}</span>
      {status === 'completed' && (
        <CheckCircle2 size={14} className='fill-success/10' aria-hidden />
      )}
      {status === 'active' && (
        <div
          className='size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none'
          aria-hidden='true'
        />
      )}
      {status === 'locked' && <Lock size={10} aria-hidden />}
    </div>
  );
}
