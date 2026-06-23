import type { Metadata } from 'next';
import type React from 'react';

import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { CtaSection } from '@/app/(marketing)/about/components/CtaSection';
import { HeroSection } from '@/app/(marketing)/about/components/HeroSection';
import { MissionSection } from '@/app/(marketing)/about/components/MissionSection';
import { ValuesSection } from '@/app/(marketing)/about/components/ValuesSection';

export const metadata: Metadata = {
  title: 'About | Atlaris',
  description:
    'Learn about Atlaris and how we help learners turn goals into structured execution.',
  openGraph: {
    title: 'About | Atlaris',
    description:
      'Learn about Atlaris and how we help learners turn goals into structured execution.',
    url: '/about',
    images: ['/og-default.jpg'],
  },
};

export default function Page(): React.ReactElement {
  return (
    <MarketingPageShell withHeaderOffset>
      <HeroSection />
      <MissionSection />
      <ValuesSection />
      <CtaSection />
    </MarketingPageShell>
  );
}
