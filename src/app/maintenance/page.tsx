import type { Metadata } from 'next';

import { MaintenanceRecheckButton } from './MaintenanceRecheckButton';
import BrandLogo from '@/components/shared/BrandLogo';
import SiteFooter from '@/components/shared/SiteFooter';
import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';

export const metadata: Metadata = {
  title: 'Maintenance | Atlaris',
  description:
    'Atlaris is temporarily unavailable while we perform maintenance and infrastructure upgrades.',
  openGraph: {
    title: 'Maintenance | Atlaris',
    description:
      'Atlaris is temporarily unavailable while we perform maintenance and infrastructure upgrades.',
    url: '/maintenance',
    images: [OG_DEFAULT_IMAGE],
  },
};

export default function MaintenancePage() {
  return (
    <div
      className='dark relative isolate flex min-h-screen flex-col bg-background'
      data-atlaris-theme='dark'
    >
      <ResponsiveBackdrop
        desktop={{
          src: '/artwork/maintenance-backdrop-desktop.jpg',
          objectPosition: '50% 50%',
        }}
        mobile={{
          src: '/artwork/maintenance-backdrop-mobile.jpg',
          objectPosition: '70% 50%',
        }}
        overlay='vignette'
        className='block'
        priority
      />

      <main
        id='main-content'
        className='relative z-10 flex flex-1 flex-col overflow-hidden'
        tabIndex={-1}
      >
        <header className='px-4 py-5 sm:px-6 lg:px-8'>
          <div className='mx-auto flex w-full max-w-7xl items-center'>
            <BrandLogo linked={false} size='sm' />
          </div>
        </header>

        <div className='mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6'>
          <div className='flex flex-1 flex-col items-center justify-center py-12 sm:py-16'>
            <div className='w-full max-w-2xl text-center'>
              <p className='mx-auto inline-flex rounded-full border border-primary/35 bg-panel px-4 py-2 text-[11px] leading-none font-medium tracking-[0.22em] text-primary uppercase'>
                Maintenance
              </p>

              <h1 className='mx-auto mt-7 max-w-[20ch] font-serif text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'>
                We’ll be back <span className='text-primary'>soon.</span>
              </h1>

              <p className='mx-auto mt-5 max-w-136 text-base leading-relaxed text-muted-foreground sm:text-lg'>
                Atlaris is temporarily unavailable while maintenance is in
                progress. Please try again in a few minutes.
              </p>

              <MaintenanceRecheckButton />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter variant='maintenance' />
    </div>
  );
}
