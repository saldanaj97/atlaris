'use client';

import type { ClientPlanDetail } from '@/shared/types/client.types';

import { formatOrigin } from './plan-pending-view-state';
import { formatSkillLevel } from '@/features/plans/formatters';

export function PendingPlanDetails({ plan }: { plan: ClientPlanDetail }) {
  return (
    <section className='border-t pt-4' aria-labelledby='plan-details-heading'>
      <h3 id='plan-details-heading' className='mb-3 text-sm font-semibold'>
        Plan Details
      </h3>
      <dl className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
        <div>
          <dt className='text-muted-foreground'>Skill Level</dt>
          <dd className='mt-0.5 text-foreground'>
            {formatSkillLevel(plan.skillLevel)}
          </dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>Weekly Hours</dt>
          <dd className='mt-0.5 text-foreground'>{plan.weeklyHours}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>Learning Style</dt>
          <dd className='mt-0.5 text-foreground'>{plan.learningStyle}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>Origin</dt>
          <dd className='mt-0.5 text-foreground'>
            {formatOrigin(plan.origin)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
