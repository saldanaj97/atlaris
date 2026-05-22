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
        'z-10 flex h-6 w-6 items-center justify-center rounded-full border-[3px] bg-panel transition-all duration-500 ease-out',
        getTimelineMarkerClassName(status),
      )}
    >
      {status === 'completed' && (
        <CheckCircle2 size={14} className="fill-success/10" />
      )}
      {status === 'active' && (
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      )}
      {status === 'locked' && <Lock size={10} />}
    </div>
  );
}
