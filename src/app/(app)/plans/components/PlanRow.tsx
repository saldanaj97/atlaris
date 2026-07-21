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
  selectionMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onSelectionChange?: (planId: string, selected: boolean) => void;
}

function StatusPill({ plan }: { plan: PlanListItem }) {
  return (
    <span
      className={cn(
        'ml-auto inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground',
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
  lastActivity,
}: {
  plan: PlanListItem;
  progressPercent: number;
  lastActivity: string;
}) {
  return (
    <div className='flex min-w-0 flex-1 items-center gap-2'>
      <span className='truncate font-semibold text-foreground'>
        {plan.topic}
      </span>
      {progressPercent >= 80 ? (
        <Sparkles className='size-3.5 shrink-0 text-warning' />
      ) : null}
      <LastActivity value={lastActivity} />
    </div>
  );
}

function NextTask({ plan }: { plan: PlanListItem }) {
  let label: string;
  let showArrow = false;

  if (plan.status === 'completed') {
    label = 'All tasks completed';
  } else if (plan.status === 'generating' || plan.status === 'failed') {
    label = PLAN_STATUS_LABELS[plan.status];
  } else if (plan.completedTasks === 0) {
    label = 'Not started';
  } else {
    label = 'Continue learning';
    showArrow = true;
  }

  return (
    <div className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
      {showArrow ? <ArrowRight className='size-3 shrink-0' /> : null}
      <span className='truncate'>{label}</span>
    </div>
  );
}

function TaskProgress({
  plan,
  progressPercent,
}: {
  plan: PlanListItem;
  progressPercent: number;
}) {
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
        <NextTask plan={plan} />
        <span className='flex shrink-0 items-center gap-1.5 tabular-nums'>
          <CheckCircle2 className='size-3.5 shrink-0' aria-hidden='true' />
          {plan.completedTasks}/{plan.totalTasks} tasks
        </span>
      </div>
      <ProgressTrack progressPercent={progressPercent} />
    </div>
  );
}

function LastActivity({ value }: { value: string }) {
  return (
    <div className='flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground'>
      <Clock className='size-3.5 shrink-0' />
      <span className='whitespace-nowrap'>{value}</span>
    </div>
  );
}

function ProgressTrack({ progressPercent }: { progressPercent: number }) {
  return (
    <>
      <progress className='sr-only' value={progressPercent} max={100}>
        {progressPercent}% of tasks complete
      </progress>
      <div className='h-1 overflow-hidden rounded-full bg-panel-border/40'>
        <div
          className='h-full w-full origin-left rounded-full bg-primary transition-transform duration-300'
          style={{ transform: `scaleX(${progressPercent / 100})` }}
        />
      </div>
    </>
  );
}

export function PlanRow({
  plan,
  referenceTimestamp,
  selectionMode = false,
  selected = false,
  selectable = true,
  onSelectionChange,
}: PlanRowProps) {
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(plan.completion * 100)),
  );
  const lastActivity = getPlanLastActivityRelative(
    plan.updatedAt ?? plan.createdAt,
    referenceTimestamp,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const rowContent = (
    <>
      <div className='flex min-w-0 items-center gap-2'>
        <PlanTitle
          plan={plan}
          progressPercent={progressPercent}
          lastActivity={lastActivity}
        />
        <StatusPill plan={plan} />
      </div>

      <div className='mt-3'>
        <TaskProgress plan={plan} progressPercent={progressPercent} />
      </div>
    </>
  );

  return (
    <div className='relative'>
      <DeletePlanDialog
        planId={plan.id}
        planTopic={plan.topic}
        isGenerating={plan.status === 'generating'}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      <div className='relative flex items-start gap-3'>
        {selectionMode ? (
          <div className='flex shrink-0 pt-4'>
            <input
              type='checkbox'
              checked={selected}
              disabled={!selectable}
              aria-label={
                selectable
                  ? `Select ${plan.topic}`
                  : `Cannot select ${plan.topic} while it is generating`
              }
              onChange={(event) =>
                onSelectionChange?.(plan.id, event.currentTarget.checked)
              }
              className='size-4 rounded border-border text-primary focus-visible:ring-ring/50'
            />
          </div>
        ) : null}

        <div className='relative min-w-0 flex-1'>
          <div className='group rounded-2xl border border-panel-border bg-panel px-4 py-3.5 shadow-sm transition-[border-color,box-shadow,background-color] hover:border-primary/30 hover:bg-panel-muted hover:shadow-md'>
            {selectionMode ? (
              <div className='block min-w-0'>{rowContent}</div>
            ) : (
              <Link href={`/plans/${plan.id}`} className='block min-w-0 pr-12'>
                {rowContent}
              </Link>
            )}
          </div>

          {!selectionMode ? (
            <div className='absolute inset-y-0 right-2 flex items-center'>
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
