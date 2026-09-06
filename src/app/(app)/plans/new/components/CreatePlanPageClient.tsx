'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';
import type React from 'react';

import { AiPlanGenerationPanel } from '@/app/(app)/plans/new/components/AiPlanGenerationPanel';
import { Card } from '@/components/ui/card';
import { Check, Sparkles } from 'lucide-react';
import Image from 'next/image';

export function CreatePlanPageClient({
  subscriptionTier,
}: {
  subscriptionTier: SubscriptionTier;
}): React.ReactElement {
  return (
    <div className='w-full space-y-6'>
      <header className='relative isolate overflow-hidden rounded-[12px] border border-panel-border bg-panel px-5 py-7 sm:px-7 sm:py-8 lg:px-9 lg:py-10'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 hidden dark:block'
        >
          <Image
            src='/artwork/planetary-horizon-desktop.jpg'
            alt=''
            aria-hidden='true'
            width={1672}
            height={640}
            sizes='100vw'
            className='absolute inset-0 hidden size-full object-cover object-[78%_50%] opacity-80 md:block'
          />
          <Image
            src='/artwork/planetary-horizon-mobile.jpg'
            alt=''
            aria-hidden='true'
            width={705}
            height={941}
            sizes='100vw'
            className='absolute inset-0 size-full object-cover object-[68%_42%] opacity-75 md:hidden'
          />
          <div className='absolute inset-0 bg-linear-to-r from-panel via-panel/90 to-panel/20' />
        </div>

        <div className='relative max-w-2xl'>
          <p className='flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-primary uppercase'>
            <Sparkles aria-hidden='true' className='size-4' />
            Create your plan
          </p>
          <h1 className='font-heading mt-3 max-w-xl text-[32px] leading-[1.15] tracking-[-0.03em] text-balance text-foreground sm:text-[40px]'>
            What do you want to <span className='text-primary'>learn?</span>
          </h1>
          <p className='mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
            Name the goal, your level, and the time you actually have. Atlaris
            charts the route.
          </p>
        </div>
      </header>

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
