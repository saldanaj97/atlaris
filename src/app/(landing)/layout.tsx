import type { ReactNode } from 'react';

import SiteFooter from '@/components/shared/SiteFooter';
import SiteHeader from '@/components/shared/SiteHeader';

export default function LandingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <main id='main-content' className='flex-1' tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
