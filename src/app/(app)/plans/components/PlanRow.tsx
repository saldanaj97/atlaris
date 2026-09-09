'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';

import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import {
  getPlanCoverImage,
  getPlanLastActivityRelative,
} from '@/app/(app)/plans/components/plan-utils';
import {
  getPlanStatusBadgeClassName,
  getPlanStatusDotClassName,
  PLAN_STATUS_LABELS,
} from '@/app/(app)/plans/plan-status-theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Check,
  Clock3,
  MoreVertical,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
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

function planActionLabel(status: PlanListItem['status']): string {
  switch (status) {
    case 'completed':
    case 'failed':
      return 'View plan';
    case 'generating':
      return 'View progress';
    case 'active':
    case 'paused':
    case 'not_started':
      return 'Continue learning';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function PlanProgress({
  plan,
  progressPercent,
}: {
  plan: PlanListItem;
  progressPercent: number;
}) {
  if (plan.access === 'locked') {
    return null;
  }

  if (plan.totalTasks <= 0) {
    if (plan.status === 'generating') {
      return (
        <div className='rounded-[8px] border border-border bg-panel-muted/60 p-3'>
          <p className='text-sm text-muted-foreground'>
            Your learning path is being prepared.
          </p>
        </div>
      );
    }

    if (plan.status === 'failed') {
      return (
        <div className='rounded-[8px] border border-danger/30 bg-danger-subtle p-3'>
          <p className='text-sm text-danger'>
            We couldn&apos;t generate this plan.
          </p>
        </div>
      );
    }

    return (
      <p className='text-sm text-muted-foreground'>
        Progress will appear when tasks are ready.
      </p>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-3 text-xs text-muted-foreground'>
        <span>Progress</span>
        <span className='font-medium text-foreground tabular-nums'>
          {progressPercent}%
        </span>
      </div>
      <Progress
        value={progressPercent}
        max={100}
        aria-label={`${progressPercent}% complete`}
        className='h-2 bg-panel-muted'
      />
    </div>
  );
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
  const planHref = `${ROUTES.PLANS.ROOT}/${plan.id}`;
  const isLocked = plan.access === 'locked';

  return (
    <li
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'group flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-panel-border bg-panel text-panel-foreground shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none',
        selected && 'border-primary/70 ring-2 ring-primary/20',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className='relative aspect-[16/9] shrink-0 overflow-hidden bg-panel-muted'>
        <Image
          src={getPlanCoverImage(plan.id)}
          alt=''
          fill
          sizes='(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw'
          className='object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none'
        />
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-linear-to-t from-[#070b10]/85 via-[#070b10]/10 to-[#070b10]/35'
        />
        <div className='absolute top-3 right-3 left-3 flex items-start justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-2'>
            <label className='inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#070b10]/55 backdrop-blur-sm'>
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
                className='size-[20px] shrink-0 rounded-[4px] border border-white/70 accent-action-primary outline-none focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-[#070b10] disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-white/15 disabled:accent-disabled disabled:opacity-100'
              />
            </label>
            <Badge
              variant='outline'
              className={cn(
                'border-white/25 bg-[#070b10]/60 text-white backdrop-blur-sm',
                getPlanStatusBadgeClassName(plan.status),
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  getPlanStatusDotClassName(plan.status),
                )}
                aria-hidden='true'
              />
              {PLAN_STATUS_LABELS[plan.status]}
            </Badge>
          </div>

          <div>
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
                  className='bg-[#070b10]/55 text-white hover:bg-[#070b10]/75 hover:text-white focus-visible:ring-offset-[#070b10]'
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
          </div>
        </div>
      </div>

      <div className='flex min-h-0 flex-1 flex-col p-4 sm:p-5'>
        <div className='min-w-0'>
          <h2 className='text-lg leading-6 font-semibold wrap-break-word text-foreground'>
            <Link
              href={planHref}
              className='rounded-sm transition-colors outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50'
            >
              {plan.topic}
            </Link>
          </h2>
          {isLocked ? (
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              This plan is locked for your current access level.
            </p>
          ) : (
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              {plan.status === 'failed'
                ? "We couldn't generate this plan."
                : plan.status === 'generating'
                  ? 'Your personalized learning path is being created.'
                  : 'Keep your next learning step close.'}
            </p>
          )}
        </div>

        <div className='mt-5'>
          <PlanProgress plan={plan} progressPercent={progressPercent} />
        </div>

        {!isLocked ? (
          <dl className='mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border/70 pt-4 text-sm'>
            <div className='min-w-0'>
              <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                <Check aria-hidden='true' className='size-3.5' />
                Tasks
              </dt>
              <dd className='mt-1 font-medium text-foreground tabular-nums'>
                {plan.completedTasks} / {plan.totalTasks}
              </dd>
            </div>
            <div className='min-w-0'>
              <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                <Clock3 aria-hidden='true' className='size-3.5' />
                Updated
              </dt>
              <dd className='mt-1 truncate font-medium text-foreground'>
                <time dateTime={updatedAt}>{lastActivity}</time>
              </dd>
            </div>
          </dl>
        ) : (
          <dl className='mt-5 border-t border-border/70 pt-4 text-sm'>
            <div>
              <dt className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                <Clock3 aria-hidden='true' className='size-3.5' />
                Updated
              </dt>
              <dd className='mt-1 font-medium text-foreground'>
                <time dateTime={updatedAt}>{lastActivity}</time>
              </dd>
            </div>
          </dl>
        )}

        <div className='mt-auto pt-5'>
          {isLocked ? (
            <Button asChild variant='outline' className='w-full'>
              <Link href={ROUTES.PRICING}>Upgrade to unlock</Link>
            </Button>
          ) : (
            <Button asChild variant='outline' className='w-full'>
              <Link href={planHref}>
                {plan.status === 'generating' ? (
                  <Sparkles aria-hidden='true' />
                ) : null}
                {planActionLabel(plan.status)}
                <ArrowRight
                  aria-hidden='true'
                  className='transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
