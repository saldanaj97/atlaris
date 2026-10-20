'use client';

import type { ClientPlanDetail } from '@/shared/types/client.types';

import {
  getStatusBadgeLabel,
  getStatusBadgeVariant,
  type PlanPendingViewState,
} from './plan-pending-view-state';
import { Badge } from '@/components/ui/badge';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatSkillLevel } from '@/features/plans/formatters';
import { Loader2 } from 'lucide-react';

export function PlanStatusHeader({
  plan,
  isPolling,
  viewState,
}: {
  plan: ClientPlanDetail;
  isPolling: boolean;
  viewState: PlanPendingViewState;
}) {
  const statusLabel = getStatusBadgeLabel(viewState);

  return (
    <CardHeader className='gap-3 px-6 pt-6'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-2'>
          <CardTitle as='h2'>{plan.topic}</CardTitle>
          <CardDescription>
            {formatSkillLevel(plan.skillLevel)}
            {plan.weeklyHours != null
              ? ` · ${plan.weeklyHours} hours / week`
              : ''}
          </CardDescription>
        </div>
        {isPolling ? (
          <Loader2
            aria-hidden='true'
            className='size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none'
          />
        ) : null}
      </div>
      <Badge variant={getStatusBadgeVariant(viewState)}>{statusLabel}</Badge>
    </CardHeader>
  );
}
