import type { ReactNode } from 'react';

import { PageShell } from '@/components/ui/page-shell';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <PageShell>{children}</PageShell>;
}
