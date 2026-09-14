'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';
import type React from 'react';

import { AiPlanGenerationPanel } from '@/app/(app)/plans/new/components/AiPlanGenerationPanel';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { PageHero } from '@/components/ui/page-hero';
import { Check } from 'lucide-react';

const PLAN_CONSTRAINTS = [
  'A clear destination',
  'Weekly time you can sustain',
  'A finish date that stays realistic',
] as const;

export function CreatePlanPageClient({
  subscriptionTier,
}: {
  subscriptionTier: SubscriptionTier;
}): React.ReactElement {
  return (
    <div className='flex w-full flex-col gap-4 sm:gap-6'>
      <PageHero
        className='rounded-[12px] border border-panel-border bg-panel px-5 py-6 sm:px-8 sm:py-5'
        contentClassName='max-w-3xl'
        overline='Create your plan'
        title={
          <>
            What do you want to <span className='text-primary'>learn?</span>
          </>
        }
        titleClassName='font-heading mt-2.5 max-w-xl text-[32px] leading-10 tracking-[-0.02em] text-balance text-foreground'
        description='Name the goal, your level, and the time you actually have. Atlaris charts the route.'
        descriptionClassName='mt-2.5 max-w-xl text-base leading-[26px] text-muted-foreground'
      />

      <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,40rem)_minmax(16rem,18rem)]'>
        <AiPlanGenerationPanel subscriptionTier={subscriptionTier} />

        <Card
          as='aside'
          aria-labelledby='plan-generation-note'
          className='gap-4 p-4 sm:p-6'
        >
          <div className='space-y-2'>
            <CardTitle as='h2' id='plan-generation-note'>
              Built around your week
            </CardTitle>
            <CardDescription>
              The route stays grounded in the constraints you choose.
            </CardDescription>
          </div>
          <ul className='space-y-3 text-sm text-foreground'>
            {PLAN_CONSTRAINTS.map((item) => (
              <li key={item} className='flex items-start gap-2'>
                <span
                  aria-hidden='true'
                  className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success'
                >
                  <Check className='size-3.5' />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
