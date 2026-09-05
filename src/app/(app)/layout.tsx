import type { ReactNode } from 'react';

import { APP_SHELL_MAIN_OFFSET } from '@/components/layout/app-shell-width';
import SiteHeader from '@/components/shared/SiteHeader';
import { PageShell } from '@/components/ui/page-shell';

export const dynamic = 'force-dynamic';

export default function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <main id='main-content' className={`flex-1 ${APP_SHELL_MAIN_OFFSET}`}>
        <PageShell>{children}</PageShell>
      </main>
    </>
  );
}
