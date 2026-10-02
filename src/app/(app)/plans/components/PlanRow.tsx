'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';

import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { getPlanLastActivityRelative } from '@/app/(app)/plans/components/plan-utils';
import {
  getPlanStatusBadgeClassName,
  getPlanStatusDotClassName,
  PLAN_STATUS_LABELS,
} from '@/app/(app)/plans/plan-status-theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { ArrowRight, MoreVertical, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

interface PlanRowProps {
  plan: PlanListItem;
  /** Position in the rendered page; staggers the entry animation. */
  index?: number;
  referenceTimestamp: string;
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

type PlanCardRevealState = 'pending' | 'visible' | undefined;

/**
 * Cards already on screen at load keep the load stagger (state stays
 * undefined). Cards below the fold are hidden until they scroll into view.
 */
function usePlanCardReveal(ref: RefObject<HTMLElement | null>) {
  const [revealState, setRevealState] = useState<PlanCardRevealState>();

  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let isFirstCallback = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      const wasFirstCallback = isFirstCallback;
      isFirstCallback = false;

      if (entry.isIntersecting) {
        if (!wasFirstCallback) setRevealState('visible');
        observer.disconnect();
      } else if (wasFirstCallback) {
        setRevealState('pending');
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return revealState;
}

function PlanProgress({
  plan,
  progressPercent,
}: {
  plan: PlanListItem;
  progressPercent: number;
}) {
  if (plan.access === 'locked') {
    return (
      <p className='type-body text-muted-foreground'>
        This plan is locked for your current access level.
      </p>
    );
  }

  if (plan.totalTasks <= 0) {
    if (plan.status === 'generating') {
      return (
        <div className='rounded-[8px] border border-border bg-panel-muted/60 p-3'>
          <p className='type-body text-muted-foreground'>
            Your learning path is being prepared.
          </p>
        </div>
      );
    }

    if (plan.status === 'failed') {
      return (
        <div className='rounded-[8px] border border-danger/30 bg-danger-subtle p-3'>
          <p className='type-body text-danger'>
            We couldn&apos;t generate this plan.
          </p>
        </div>
      );
    }

    return (
      <p className='type-body text-muted-foreground'>
        Progress will appear when tasks are ready.
      </p>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-3 type-body'>
        <span className='text-muted-foreground tabular-nums'>
          {plan.completedTasks} of {plan.totalTasks} tasks
        </span>
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
  index = 0,
  referenceTimestamp,
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
  const cardRef = useRef<HTMLDivElement>(null);
  const revealState = usePlanCardReveal(cardRef);
  const planHref = `${ROUTES.PLANS.ROOT}/${plan.id}`;
  const isLocked = plan.access === 'locked';

  return (
    <Card
      as='li'
      ref={cardRef}
      variant='interactive'
      data-state={selected ? 'selected' : undefined}
      data-reveal={revealState}
      style={
        {
          '--plan-card-delay': `${Math.min(index, 8) * 40}ms`,
        } as CSSProperties
      }
      className='group gap-0 overflow-hidden py-0 animate-plan-card-enter'
    >
      <div className='flex min-h-0 flex-1 flex-col p-4 sm:p-5'>
        <div className='flex items-start justify-between gap-2'>
          <h2 className='min-w-0 type-card wrap-break-word text-foreground'>
            {isLocked ? (
              plan.topic
            ) : (
              <Link
                href={planHref}
                className='rounded-sm transition-colors outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel'
              >
                {plan.topic}
              </Link>
            )}
          </h2>

          <div className='-mt-1 -mr-2 shrink-0'>
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
          </div>
        </div>

        <div className='mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-muted-foreground'>
          {/* oxlint-disable shadcn/require-static-classes -- This imported status recipe contains complete static classes for each plan state. */}
          <Badge
            variant='outline'
            className={getPlanStatusBadgeClassName(plan.status)}
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
          {/* oxlint-enable shadcn/require-static-classes */}
          <span aria-hidden='true'>·</span>
          <span>
            Updated <time dateTime={updatedAt}>{lastActivity}</time>
          </span>
        </div>

        <div className='mt-5 mb-5'>
          <PlanProgress plan={plan} progressPercent={progressPercent} />
        </div>

        <div className='mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-2'>
          <label className='-ml-3 inline-flex min-h-[44px] items-center gap-2 px-3 type-label text-muted-foreground has-disabled:cursor-not-allowed has-disabled:opacity-60'>
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
              className='size-[20px] shrink-0 rounded-[4px] border border-border accent-action-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:accent-disabled disabled:opacity-100'
            />
            Select
          </label>

          {isLocked ? (
            <Button asChild variant='ghost' size='sm' className='-mr-2'>
              <Link href={ROUTES.PRICING}>
                Upgrade to unlock
                <ArrowRight aria-hidden='true' />
              </Link>
            </Button>
          ) : (
            <Button asChild variant='ghost' size='sm' className='-mr-2'>
              <Link href={planHref}>
                {plan.status === 'generating' ? (
                  <Sparkles aria-hidden='true' />
                ) : null}
                {planActionLabel(plan.status)}
                <span className='sr-only'> {plan.topic}</span>
                <ArrowRight
                  aria-hidden='true'
                  className='transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
