'use client';

import type { ClientPlanDetail } from '@/shared/types/client.types';

import { formatOrigin } from './plan-pending-view-state';
import { formatSkillLevel } from '@/features/plans/formatters';

export function PendingPlanDetails({ plan }: { plan: ClientPlanDetail }) {
  return (
    <section className='border-t pt-4' aria-labelledby='plan-details-heading'>
      <h3 id='plan-details-heading' className='mb-2 font-semibold'>
        Plan Details
      </h3>
      <div className='grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2'>
        <div>
          <span className='font-medium'>Skill Level:</span>{' '}
          {formatSkillLevel(plan.skillLevel)}
        </div>
        <div>
          <span className='font-medium'>Weekly Hours:</span> {plan.weeklyHours}
        </div>
        <div>
          <span className='font-medium'>Learning Style:</span>{' '}
          {plan.learningStyle}
        </div>
        <div>
          <span className='font-medium'>Origin:</span>{' '}
          {formatOrigin(plan.origin)}
        </div>
      </div>
    </section>
  );
}
