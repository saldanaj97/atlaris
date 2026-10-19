import type { ReactElement } from 'react';

export function SettingsHero(): ReactElement {
  return (
    <header className='mb-8 min-w-0 pt-6 pb-4 sm:pt-8 sm:pb-5'>
      <h1 className='type-title text-foreground'>Settings</h1>
      <p className='mt-[12px] max-w-3xl type-input text-muted-foreground'>
        Customize your experience, manage your account, and control how you
        learn.
      </p>
    </header>
  );
}
