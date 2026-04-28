'use client';

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MoreVertical,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import { useState } from 'react';
import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import {
  getNextTaskName,
  getPlanLastActivityRelative,
  getPlanStatus,
} from '@/app/(app)/plans/components/plan-utils';
import type { PlanStatus } from '@/app/(app)/plans/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PlanSummary } from '@/shared/types/db.types';

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
  const lastActivity = getPlanLastActivityRelative(
    plan.updatedAt ?? plan.createdAt,
    referenceTimestamp,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <DeletePlanDialog
        planId={plan.id}
        planTopic={plan.topic}
        isGenerating={status === 'generating'}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
      <div
        className={`group flex items-center gap-4 rounded-2xl px-5 py-4 transition ${
          isSelected
            ? 'bg-primary/5 ring-1 ring-primary/30 dark:bg-primary/10'
            : 'hover:bg-muted-foreground/3 dark:hover:bg-foreground/5'
        }`}
      >
        <Link
          href={`/plans/${plan.id}`}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-4"
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
              <span className="truncate font-medium text-foreground">
                {plan.topic}
              </span>
              {progressPercent >= 80 && (
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              {/* Tasks count */}
              <div className="hidden w-[3.75rem] shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {summary.completedTasks}/{summary.totalTasks}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs font-medium text-muted-foreground">
              {progressPercent}%
            </span>
          </div>

          {/* Last activity */}
          <div className="hidden w-48 shrink-0 items-center justify-end gap-1.5 text-xs text-muted-foreground md:flex">
            <Clock className="h-3.5 w-3.5" />
            {lastActivity}
          </div>
        </Link>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="Plan actions"
              aria-label="Plan actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={status === 'generating'}
              onSelect={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
