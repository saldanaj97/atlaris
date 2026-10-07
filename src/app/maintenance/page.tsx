import type { Metadata } from 'next';

import { MaintenanceRecheckButton } from './MaintenanceRecheckButton';
import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import BrandLogo from '@/components/shared/BrandLogo';
import SiteFooter from '@/components/shared/SiteFooter';
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
    <div className='relative isolate flex min-h-screen flex-col overflow-hidden bg-background'>
      {/* Same star sky as /waitlist; follows the visitor's theme. */}
      <CelestialBackdrop variant='dusk' />

      <main
        id='main-content'
        className='relative z-10 flex flex-1 flex-col overflow-hidden'
        tabIndex={-1}
      >
        <header className='px-4 py-5 sm:px-6 lg:px-8'>
          <div className='mx-auto flex w-full max-w-7xl items-center'>
            <BrandLogo size='sm' />
          </div>
        </header>

        <div className='mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6'>
          <div className='flex flex-1 flex-col items-center justify-center py-12 sm:py-16'>
            <div className='w-full max-w-2xl text-center'>
              <h1 className='mx-auto max-w-[20ch] font-serif text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'>
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
