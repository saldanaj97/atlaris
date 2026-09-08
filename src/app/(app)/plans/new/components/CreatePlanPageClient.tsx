'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';
import type React from 'react';

import { AiPlanGenerationPanel } from '@/app/(app)/plans/new/components/AiPlanGenerationPanel';
import { Card } from '@/components/ui/card';
import { PageHero } from '@/components/ui/page-hero';
import { Check, Sparkles } from 'lucide-react';

export function CreatePlanPageClient({
  subscriptionTier,
}: {
  subscriptionTier: SubscriptionTier;
}): React.ReactElement {
  return (
    <div className='w-full space-y-6'>
      <PageHero
        className='rounded-[12px] border border-panel-border bg-panel px-5 py-7 sm:px-7 sm:py-8 lg:px-9 lg:py-10'
        contentClassName='max-w-2xl'
        overline='Create your plan'
        overlineIcon={<Sparkles aria-hidden='true' className='size-4' />}
        title={
          <>
            What do you want to <span className='text-primary'>learn?</span>
          </>
        }
        titleClassName='font-heading mt-3 max-w-xl text-[32px] leading-[1.15] tracking-[-0.03em] text-balance text-foreground sm:text-[40px]'
        description='Name the goal, your level, and the time you actually have. Atlaris charts the route.'
        descriptionClassName='mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'
      />

      <div className='grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]'>
        <AiPlanGenerationPanel subscriptionTier={subscriptionTier} />

        <Card
          as='aside'
          aria-labelledby='plan-generation-note'
          className='hidden gap-4 p-6 xl:flex'
        >
          <Sparkles aria-hidden='true' className='size-5 text-primary' />
          <h2
            id='plan-generation-note'
            className='text-xl leading-7 font-semibold text-foreground'
          >
            Built around your week
          </h2>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            Your goal, experience, weekly time, learning style, and finish date
            give Atlaris the context to shape a useful learning route.
          </p>
          <ul className='mt-auto space-y-3 border-t border-border/60 pt-4 text-sm text-muted-foreground'>
            <li className='flex items-start gap-2'>
              <Check
                aria-hidden='true'
                className='mt-0.5 size-4 shrink-0 text-primary'
              />
              <span>Clear goal and next steps</span>
            </li>
            <li className='flex items-start gap-2'>
              <Check
                aria-hidden='true'
                className='mt-0.5 size-4 shrink-0 text-primary'
              />
              <span>A pace that fits your schedule</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
