'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';

import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { getPlanLastActivityRelative } from '@/app/(app)/plans/components/plan-utils';
import {
  getPlanStatusPillClassName,
  PLAN_STATUS_LABELS,
} from '@/app/(app)/plans/plan-status-theme';
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

function StatusPill({ plan }: { plan: PlanListItem }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground',
        getPlanStatusPillClassName(plan.status),
      )}
    >
      {PLAN_STATUS_LABELS[plan.status]}
    </span>
  );
}

function PlanTitle({
  plan,
  progressPercent,
}: {
  plan: PlanListItem;
  progressPercent: number;
}) {
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='truncate font-semibold text-foreground'>
        {plan.topic}
      </span>
      {progressPercent >= 80 ? (
        <Sparkles className='size-3.5 shrink-0 text-warning' />
      ) : null}
    </div>
  );
}

function NextTask({ plan }: { plan: PlanListItem }) {
  const nextTask =
    plan.status === 'completed'
      ? 'All tasks completed'
      : plan.completedTasks === 0
        ? 'Not started'
        : 'Continue learning';
  const showArrow = plan.status !== 'completed' && plan.completedTasks > 0;

  return (
    <div className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
      {showArrow ? <ArrowRight className='size-3 shrink-0' /> : null}
      <span className='truncate'>{nextTask}</span>
    </div>
  );
}

function TaskCount({ plan }: { plan: PlanListItem }) {
  return (
    <div className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
      <CheckCircle2 className='size-3.5 shrink-0' />
      <span className='truncate tabular-nums'>
        {plan.completedTasks}/{plan.totalTasks} tasks
      </span>
    </div>
  );
}

function LastActivity({ value }: { value: string }) {
  return (
    <div className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
      <Clock className='size-3.5 shrink-0' />
      <span className='truncate'>{value}</span>
    </div>
  );
}

function ProgressTrack({ progressPercent }: { progressPercent: number }) {
  return (
    <>
      <progress className='sr-only' value={progressPercent} max={100}>
        {progressPercent}% complete
      </progress>
      <div className='h-1 overflow-hidden rounded-full bg-muted-foreground/10'>
        <div
          className='h-full rounded-full bg-primary'
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </>
  );
}

export function PlanRow({ plan, referenceTimestamp }: PlanRowProps) {
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(plan.completion * 100)),
  );
  const lastActivity = getPlanLastActivityRelative(
    plan.updatedAt ?? plan.createdAt,
    referenceTimestamp,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className='relative'>
      <DeletePlanDialog
        planId={plan.id}
        planTopic={plan.topic}
        isGenerating={plan.status === 'generating'}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      <div className='relative'>
        <div className='group rounded-2xl border border-panel-border bg-panel px-4 py-3.5 shadow-sm transition-[border-color,box-shadow,background-color] hover:border-primary/25 hover:bg-panel-muted/35 hover:shadow-md'>
          <Link href={`/plans/${plan.id}`} className='block min-w-0 pr-12'>
            <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_7.5rem_7rem] md:items-start md:gap-4'>
              <div className='min-w-0 space-y-1.5'>
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <StatusPill plan={plan} />
                  <PlanTitle plan={plan} progressPercent={progressPercent} />
                </div>
                <NextTask plan={plan} />
              </div>

              <div className='min-w-0 md:pt-1'>
                <TaskCount plan={plan} />
              </div>
              <div className='min-w-0 md:pt-1'>
                <LastActivity value={lastActivity} />
              </div>
            </div>

            <div className='mt-3'>
              <ProgressTrack progressPercent={progressPercent} />
            </div>
          </Link>
        </div>

        <div className='absolute top-2 right-2'>
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
      </div>
    </div>
  );
}
