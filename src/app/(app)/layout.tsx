import type { ReactNode } from 'react';

import {
  APP_SHELL_MAIN_OFFSET,
  APP_SHELL_SIDEBAR_OFFSET,
} from '@/components/layout/app-shell-width';
import SiteHeaderFallback from '@/components/shared/nav/SiteHeaderFallback';
import SiteHeader from '@/components/shared/SiteHeader';
import { PageShell } from '@/components/ui/page-shell';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <Suspense fallback={<SiteHeaderFallback />}>
        <SiteHeader />
      </Suspense>
      <main
        id='main-content'
        className={`flex-1 ${APP_SHELL_MAIN_OFFSET} ${APP_SHELL_SIDEBAR_OFFSET}`}
        tabIndex={-1}
      >
        <PageShell>{children}</PageShell>
      </main>
    </>
  );
}
