import type { ReactElement } from 'react';

export function SettingsHero(): ReactElement {
  return (
    <header className='mb-8 min-w-0 pt-6 pb-4 sm:pt-8 sm:pb-5'>
      <h1 className='font-heading text-(length:--at-fluid-title-sm,clamp(1.75rem,1.4rem+1.5vw,2rem)) leading-[1.15] font-semibold tracking-[-0.02em] text-foreground'>
        Settings
      </h1>
      <p className='mt-[12px] max-w-3xl text-base leading-[24px] text-muted-foreground'>
        Customize your experience, manage your account, and control how you
        learn.
      </p>
    </header>
  );
}
