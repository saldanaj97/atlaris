import type { Metadata } from 'next';

import SiteFooter from '@/components/shared/SiteFooter';
import { Card } from '@/components/ui/card';
import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import { Settings2 } from 'lucide-react';

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
    <div className='flex min-h-screen flex-col bg-background'>
      <main
        id='main-content'
        className='relative isolate flex flex-1 flex-col overflow-hidden'
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
          overlay='background'
        />

        <div className='relative z-10 flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20'>
          <div className='flex w-full flex-1 items-center justify-center'>
            <div className='w-full max-w-2xl text-center'>
              <p className='mx-auto inline-flex rounded-full border border-primary/35 bg-panel px-4 py-2 text-[11px] leading-none font-medium tracking-[0.22em] text-primary uppercase'>
                Maintenance
              </p>

              <h1 className='mx-auto mt-7 max-w-[20ch] font-serif text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'>
                We’ll be back <span className='text-primary'>soon.</span>
              </h1>

              <p className='mx-auto mt-5 max-w-[34rem] text-base leading-relaxed text-muted-foreground sm:text-lg'>
                Atlaris is currently undergoing scheduled maintenance to improve
                your learning experience. Please try again in a few minutes.
              </p>

              <Card
                as='section'
                aria-labelledby='maintenance-status-heading'
                className='mx-auto mt-8 max-w-[28rem] gap-0 p-5 text-left sm:p-6'
              >
                <div className='flex items-start gap-4'>
                  <span className='grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary'>
                    <Settings2 className='size-6' aria-hidden='true' />
                  </span>
                  <div className='min-w-0'>
                    <h2
                      id='maintenance-status-heading'
                      className='text-base font-medium text-foreground'
                    >
                      System improvements in progress
                    </h2>
                    <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
                      Please try again in a few minutes. Thank you for your
                      patience.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <p className='mx-auto max-w-md text-center text-[11px] leading-relaxed tracking-[0.18em] text-muted-foreground uppercase'>
            “A brighter future takes a little patience.”
            <span className='mt-1 block'>— Atlaris</span>
          </p>
        </div>
      </main>
      <SiteFooter variant='maintenance' />
    </div>
  );
}
