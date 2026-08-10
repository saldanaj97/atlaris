'use client';

import type { ClientPlanDetail } from '@/shared/types/client.types';

import {
  getStatusBadgeLabel,
  getStatusBadgeVariant,
  type PlanPendingViewState,
} from './plan-pending-view-state';
import { Badge } from '@/components/ui/badge';
import { CardHeader, CardTitle } from '@/components/ui/card';
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
  return (
    <CardHeader className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <Badge variant='default' className='uppercase'>
            {formatSkillLevel(plan.skillLevel)}
          </Badge>
          <Badge
            variant={getStatusBadgeVariant(viewState)}
            className='ml-2 uppercase'
          >
            {getStatusBadgeLabel(viewState)}
          </Badge>
        </div>
        {isPolling ? (
          <Loader2 className='size-6 animate-spin text-primary motion-reduce:animate-none' />
        ) : null}
      </div>
      <CardTitle className='text-lg'>Generation Status</CardTitle>
    </CardHeader>
  );
}
