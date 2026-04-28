import { PageShell } from '@/components/ui/page-shell';

export default function PlansLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PageShell>{children}</PageShell>;
}
