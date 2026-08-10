import {
  getTimelineMarkerClassName,
  type ModuleStatus,
} from '@/app/(app)/plans/plans-progress-theme';
import { cn } from '@/lib/utils';
import { CheckCircle2, Lock } from 'lucide-react';

export function TimelineModuleMarker({ status }: { status: ModuleStatus }) {
  return (
    <div
      className={cn(
        'z-10 flex size-6 items-center justify-center rounded-full border-[3px] bg-panel transition-[border-color,background-color,box-shadow] duration-500 ease-out',
        getTimelineMarkerClassName(status),
      )}
    >
      {status === 'completed' && (
        <CheckCircle2 size={14} className='fill-success/10' />
      )}
      {status === 'active' && (
        <div className='size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none' />
      )}
      {status === 'locked' && <Lock size={10} />}
    </div>
  );
}
