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
import { TableCell, TableRow } from '@/components/ui/table';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { MoreVertical, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type RefObject, useRef, useState } from 'react';

interface PlanRowProps {
  plan: PlanListItem;
  referenceTimestamp: string;
  index?: number;
  selected?: boolean;
  selectable?: boolean;
  onSelectionChange?: (planId: string, selected: boolean) => void;
  successFocusRef?: RefObject<HTMLElement | null>;
}

export function PlanRow({
  plan,
  referenceTimestamp,
  index = 0,
  selected = false,
  selectable = true,
  onSelectionChange,
  successFocusRef,
}: PlanRowProps) {
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(plan.completion * 100)),
  );
  const updatedAt = plan.updatedAt ?? plan.createdAt;
  const lastActivity = getPlanLastActivityRelative(
    updatedAt,
    referenceTimestamp,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className='animate-in border-border/60 fill-mode-both fade-in slide-in-from-bottom-1 hover:bg-secondary/30 motion-reduce:animate-none'
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <TableCell className='w-10 px-3'>
        <label className='inline-flex min-h-[44px] min-w-[44px] items-center justify-center'>
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
            className='size-[20px] shrink-0 rounded-[4px] border border-border accent-action-primary outline-none focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:accent-disabled disabled:opacity-100'
          />
        </label>
      </TableCell>

      <TableCell className='max-w-md min-w-72 py-4'>
        {plan.access === 'locked' ? (
          <div className='min-w-0'>
            <span className='block truncate font-medium text-foreground'>
              {plan.topic}
            </span>
            <Link
              href={ROUTES.PRICING}
              className='mt-1 inline-block text-xs font-medium text-primary'
            >
              Upgrade to unlock
            </Link>
          </div>
        ) : (
          <Link
            href={`/plans/${plan.id}`}
            className='block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
          >
            <span className='block truncate font-medium text-foreground'>
              {plan.topic}
            </span>
          </Link>
        )}
      </TableCell>

      <TableCell className='min-w-44'>
        {plan.access === 'locked' ? (
          <span className='text-xs text-muted-foreground'>Locked</span>
        ) : (
          <div className='flex items-center gap-2.5'>
            <progress
              className='sr-only'
              value={progressPercent}
              max={100}
              aria-label={`${progressPercent}% complete`}
            />
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
        )}
      </TableCell>

      <TableCell className='text-xs text-muted-foreground tabular-nums'>
        {plan.access === 'locked'
          ? '—'
          : `${plan.completedTasks} / ${plan.totalTasks}`}
      </TableCell>

      <TableCell>
        <span className='inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap text-muted-foreground'>
          <span
            className={cn(
              'size-1.5 rounded-full',
              getPlanStatusDotClassName(plan.status),
            )}
            aria-hidden='true'
          />
          {PLAN_STATUS_LABELS[plan.status]}
        </span>
      </TableCell>

      <TableCell>
        <time
          dateTime={updatedAt}
          className='text-xs whitespace-nowrap text-muted-foreground'
        >
          {lastActivity}
        </time>
      </TableCell>

      <TableCell className='w-12 text-right'>
        <DeletePlanDialog
          planId={plan.id}
          planTopic={plan.topic}
          isGenerating={plan.status === 'generating'}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          returnFocusRef={actionsTriggerRef}
          successFocusRef={successFocusRef}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={actionsTriggerRef}
              variant='ghost'
              size='icon-sm'
              title='Plan actions'
              aria-label={`Actions for ${plan.topic}`}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              variant='destructive'
              disabled={plan.status === 'generating'}
              onSelect={() => setDeleteDialogOpen(true)}
            >
              <Trash2 />
              Delete plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
