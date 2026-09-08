import type { ReactElement } from 'react';

import { PageHero } from '@/components/ui/page-hero';
import { Settings } from 'lucide-react';

export function SettingsHero(): ReactElement {
  return (
    <PageHero
      className='mb-6 rounded-[12px] border border-panel-border bg-panel shadow-sm'
      contentClassName='relative flex min-h-[18rem] flex-col justify-center px-5 py-8 sm:min-h-[20rem] sm:px-8 sm:py-10 lg:px-10'
      mobile={{ className: 'inset-y-0 right-0 h-full w-[82%] opacity-75' }}
      overline='Settings'
      overlineIcon={<Settings aria-hidden='true' className='size-4' />}
      title='Make Atlaris yours.'
      titleClassName='font-heading mt-3 max-w-xl text-[32px] leading-[1.1] tracking-[-0.03em] text-balance text-foreground sm:text-[42px]'
      description='Customize your experience, manage your account, and control how you learn.'
      descriptionClassName='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'
    >
      <p
        aria-hidden='true'
        className='pointer-events-none absolute top-1/2 right-5 hidden -translate-y-1/2 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase [writing-mode:vertical-rl] lg:block'
      >
        Discipline today. Opportunity tomorrow.
      </p>
    </PageHero>
  );
}
