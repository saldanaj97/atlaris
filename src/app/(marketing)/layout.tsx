import type { ReactNode } from 'react';

import { APP_SHELL_MAIN_OFFSET } from '@/components/layout/app-shell-width';
import SiteFooter from '@/components/shared/SiteFooter';
import SiteHeader from '@/components/shared/SiteHeader';

export default function MarketingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <main id='main-content' className={`flex-1 ${APP_SHELL_MAIN_OFFSET}`}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
