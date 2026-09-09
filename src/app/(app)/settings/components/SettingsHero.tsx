import type { ReactElement } from 'react';

import { SectionOverline } from '@/components/ui/section-overline';

export function SettingsHero(): ReactElement {
  return (
    <header className='mb-[32px] min-w-0 pt-[16px] lg:mb-[48px] lg:pt-[24px]'>
      <SectionOverline>Make Atlaris yours</SectionOverline>
      <h1 className='font-heading mt-[12px] text-[28px] leading-[36px] font-semibold tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-[40px]'>
        Settings
      </h1>
      <p className='mt-[12px] max-w-3xl text-base leading-[24px] text-muted-foreground'>
        Customize your experience, manage your account, and control how you
        learn.
      </p>
    </header>
  );
}
