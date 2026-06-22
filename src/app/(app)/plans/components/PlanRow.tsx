'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';

import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { getPlanLastActivityRelative } from '@/app/(app)/plans/components/plan-utils';
import { getPlanStatusDotClassName } from '@/app/(app)/plans/plan-status-theme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MoreVertical,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface PlanRowProps {
  plan: PlanListItem;
  referenceTimestamp: string;
}

function getNextTaskLabel(plan: PlanListItem): string {
  if (plan.status === 'completed') return 'All tasks completed';
  if (plan.completedTasks === 0) return 'Not started';
  return 'Continue learning';
}

export function PlanRow({ plan, referenceTimestamp }: PlanRowProps) {
  const progressPercent = Math.round(plan.completion * 100);
  const nextTask = getNextTaskLabel(plan);
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
        isGenerating={plan.status === 'generating'}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
      <div
        className={cn(
          'group flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors',
          'hover:bg-muted-foreground/3 dark:hover:bg-foreground/5',
        )}
      >
        <Link
          href={`/plans/${plan.id}`}
          className='flex min-w-0 flex-1 items-center gap-4'
        >
          {/* Status indicator */}
          <div className='relative shrink-0'>
            <div
              className={cn(
                'size-3 rounded-full',
                getPlanStatusDotClassName(plan.status),
              )}
            />
            {plan.status === 'generating' && (
              <div
                className={cn(
                  'absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:animate-none',
                  getPlanStatusDotClassName(plan.status),
                )}
              />
            )}
          </div>

          {/* Title & Next Task */}
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='truncate font-medium text-foreground'>
                {plan.topic}
              </span>
              {progressPercent >= 80 && (
                <Sparkles className='size-3.5 shrink-0 text-warning' />
              )}
              {/* Tasks count */}
              <div className='hidden w-[3.75rem] shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex'>
                <CheckCircle2 className='size-3.5' />
                <span className='tabular-nums'>
                  {plan.completedTasks}/{plan.totalTasks}
                </span>
              </div>
            </div>
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
              {plan.completedTasks > 0 &&
                nextTask !== 'Not started' &&
                nextTask !== 'All tasks completed' && (
                  <ArrowRight className='size-3' />
                )}
              <span className='truncate'>{nextTask}</span>
            </div>
          </div>

          {/* Progress */}
          <div className='flex w-32 shrink-0 items-center gap-2'>
            <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/10'>
              <div
                className='h-full rounded-full bg-primary'
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className='w-8 text-right text-xs font-medium text-muted-foreground tabular-nums'>
              {progressPercent}%
            </span>
          </div>

          {/* Last activity */}
          <div className='hidden w-48 shrink-0 items-center justify-end gap-1.5 text-xs text-muted-foreground md:flex'>
            <Clock className='size-3.5' />
            {lastActivity}
          </div>
        </Link>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              title='Plan actions'
              aria-label='Plan actions'
            >
              <MoreVertical className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              variant='destructive'
              disabled={plan.status === 'generating'}
              onSelect={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className='mr-2 size-4' />
              Delete plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
