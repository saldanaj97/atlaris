import type { ReactElement } from 'react';

export function SettingsHero(): ReactElement {
  return (
    <header className='mb-8 min-w-0 pt-6 pb-4 sm:pt-8 sm:pb-5'>
      <h1 className='font-heading text-[28px] leading-[36px] font-semibold tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-[40px]'>
        Settings
      </h1>
      <p className='mt-[12px] max-w-3xl text-base leading-[24px] text-muted-foreground'>
        Customize your experience, manage your account, and control how you
        learn.
      </p>
    </header>
  );
}
