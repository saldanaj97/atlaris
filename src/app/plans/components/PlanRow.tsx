import type { JSX } from 'react';

import { DeletePlanDialog } from '@/app/plans/components/DeletePlanDialog';
import {
  getNextTaskName,
  getPlanStatus,
  getRelativeTime,
} from '@/app/plans/components/plan-utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MoreVertical,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

import type { PlanStatus } from '@/app/plans/types';
import type { PlanSummary } from '@/lib/types/db';

const STATUS_COLORS: Record<PlanStatus, string> = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  completed: 'bg-blue-500',
  generating: 'bg-purple-500',
  failed: 'bg-red-500',
};

interface PlanRowProps {
  summary: PlanSummary;
  isSelected: boolean;
  onSelect: () => void;
  referenceTimestamp: string;
}

export function PlanRow({
  summary,
  isSelected,
  onSelect,
  referenceTimestamp,
}: PlanRowProps): JSX.Element {
  const { plan } = summary;
  const progressPercent = Math.round(summary.completion * 100);
  const status = getPlanStatus(summary, referenceTimestamp);
  const nextTask = getNextTaskName(summary);
  const lastActivity = getRelativeTime(
    plan.updatedAt ?? plan.createdAt,
    referenceTimestamp
  );

  return (
    <Link
      href={`/plans/${plan.id}`}
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-4 rounded-2xl px-5 py-4 transition ${
        isSelected
          ? 'bg-primary/5 ring-primary/30 dark:bg-primary/10 ring-1'
          : 'hover:bg-muted-foreground/3 dark:hover:bg-foreground/5'
      }`}
    >
      {/* Status indicator */}
      <div className="relative shrink-0">
        <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[status]}`} />
        {status === 'generating' && (
          <div
            className={`absolute inset-0 animate-ping rounded-full ${STATUS_COLORS[status]} opacity-50`}
          />
        )}
      </div>

      {/* Title & Next Task */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate font-medium">
            {plan.topic}
          </span>
          {progressPercent >= 80 && (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          {/* Tasks count */}
          <div className="text-muted-foreground hidden w-[3.75rem] shrink-0 items-center gap-1.5 text-xs sm:flex">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>
              {summary.completedTasks}/{summary.totalTasks}
            </span>
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {summary.completedTasks > 0 &&
            nextTask !== 'Not started' &&
            nextTask !== 'All tasks completed' && (
              <ArrowRight className="h-3 w-3" />
            )}
          <span className="truncate">{nextTask}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex w-32 shrink-0 items-center gap-2">
        <div className="bg-muted-foreground/10 h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-muted-foreground w-8 text-right text-xs font-medium">
          {progressPercent}%
        </span>
      </div>

      {/* Last activity */}
      <div className="text-muted-foreground hidden w-48 shrink-0 items-center justify-end gap-1.5 text-xs md:flex">
        <Clock className="h-3.5 w-3.5" />
        {lastActivity}
      </div>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Plan actions"
            aria-label="Plan actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DeletePlanDialog
            planId={plan.id}
            planTopic={plan.topic}
            isGenerating={status === 'generating'}
          >
            <DropdownMenuItem
              variant="destructive"
              disabled={status === 'generating'}
              onSelect={(e) => e.preventDefault()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete plan
            </DropdownMenuItem>
          </DeletePlanDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </Link>
  );
}
