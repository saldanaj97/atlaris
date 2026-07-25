'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';

import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { getPlanLastActivityRelative } from '@/app/(app)/plans/components/plan-utils';
import {
  getPlanStatusDotClassName,
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
import { MoreVertical, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface PlanRowProps {
  plan: PlanListItem;
  referenceTimestamp: string;
  /** List paint index for staggered load-in (capped like dashboard ActivityCard). */
  index?: number;
  selectionMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onSelectionChange?: (planId: string, selected: boolean) => void;
}

function getNextStepLabel(plan: PlanListItem): string {
  if (plan.status === 'completed') return 'All tasks complete';
  if (plan.status === 'generating' || plan.status === 'failed') {
    return PLAN_STATUS_LABELS[plan.status];
  }
  if (plan.completedTasks === 0) return 'Not started';
  return 'Continue learning';
}

function PlanStatusControl({
  plan,
  selectionMode,
  selected,
  selectable,
  onSelectionChange,
}: {
  plan: PlanListItem;
  selectionMode: boolean;
  selected: boolean;
  selectable: boolean;
  onSelectionChange?: (planId: string, selected: boolean) => void;
}) {
  const forceCheckbox = selectionMode || selected;
  const showInteractiveCheckbox = selectable || selectionMode;

  if (!showInteractiveCheckbox) {
    return (
      <span className='flex size-4 shrink-0 items-center justify-center'>
        <span
          className={cn(
            'size-1.5 rounded-full',
            getPlanStatusDotClassName(plan.status),
          )}
          aria-hidden='true'
        />
      </span>
    );
  }

  return (
    <div className='group/status pointer-events-auto relative z-10 flex size-4 shrink-0 items-center justify-center'>
      <span
        className={cn(
          'size-1.5 rounded-full transition-opacity duration-150 motion-reduce:transition-none',
          getPlanStatusDotClassName(plan.status),
          forceCheckbox
            ? 'opacity-0'
            : 'group-hover:opacity-0 group-focus-within/status:opacity-0',
        )}
        aria-hidden='true'
      />
      <input
        type='checkbox'
        checked={selected}
        disabled={!selectable}
        aria-label={
          selectable
            ? `Select ${plan.topic}`
            : `Cannot select ${plan.topic} while it is generating`
        }
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          onSelectionChange?.(plan.id, event.currentTarget.checked)
        }
        className={cn(
          'absolute size-4 shrink-0 rounded border border-border accent-primary transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50',
          forceCheckbox
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within/status:opacity-100',
        )}
      />
    </div>
  );
}

/**
 * Ledger-style plan row: status control, topic + meta on the left, progress
 * figures on the right. Hairline rules come from the parent list.
 */
export function PlanRow({
  plan,
  referenceTimestamp,
  index = 0,
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

  const statusControl = (
    <PlanStatusControl
      plan={plan}
      selectionMode={selectionMode}
      selected={selected}
      selectable={selectable}
      onSelectionChange={onSelectionChange}
    />
  );

  const rowBody = (
    <>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium text-foreground'>
          {plan.topic}
        </p>
        <p className='mt-0.5 truncate text-xs text-muted-foreground'>
          {getNextStepLabel(plan)} · {lastActivity}
        </p>
      </div>

      <span className='hidden shrink-0 text-xs text-muted-foreground tabular-nums md:inline'>
        {plan.completedTasks}/{plan.totalTasks} tasks
      </span>

      {/* Compact bearing: hairline track + numeral, right-aligned. */}
      <div className='hidden shrink-0 items-center gap-2.5 sm:flex'>
        <progress className='sr-only' value={progressPercent} max={100}>
          {progressPercent}% of tasks complete
        </progress>
        <div className='h-px w-20 bg-border' aria-hidden='true'>
          <div
            className='h-[3px] -translate-y-px bg-primary transition-[width] duration-500 motion-reduce:transition-none'
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className='w-9 text-right text-xs text-foreground tabular-nums'>
          {progressPercent}%
        </span>
      </div>

      <span className='hidden w-24 shrink-0 text-right text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase lg:inline'>
        {PLAN_STATUS_LABELS[plan.status]}
      </span>
    </>
  );

  return (
    <div
      className='group relative flex animate-in items-center gap-3 px-2 py-4 transition-colors duration-500 fill-mode-both fade-in slide-in-from-bottom-1 hover:bg-secondary/40 motion-reduce:animate-none'
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <DeletePlanDialog
        planId={plan.id}
        planTopic={plan.topic}
        isGenerating={plan.status === 'generating'}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      {selectionMode ? (
        <>
          {statusControl}
          {rowBody}
        </>
      ) : (
        <>
          <Link
            href={`/plans/${plan.id}`}
            className='absolute inset-0 rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
          >
            <span className='sr-only'>Open plan: {plan.topic}</span>
          </Link>
          {statusControl}
          {rowBody}
          <div className='relative z-10 shrink-0'>
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
      )}
    </div>
  );
}
