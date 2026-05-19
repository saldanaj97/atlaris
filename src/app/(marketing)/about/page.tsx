import type { Metadata } from 'next';
import type React from 'react';
import { CtaSection } from '@/app/(marketing)/about/components/CtaSection';
import { HeroSection } from '@/app/(marketing)/about/components/HeroSection';
import { MissionSection } from '@/app/(marketing)/about/components/MissionSection';
import { TeamSection } from '@/app/(marketing)/about/components/TeamSection';
import { ValuesSection } from '@/app/(marketing)/about/components/ValuesSection';

export const metadata: Metadata = {
  title: 'About | Atlaris',
  description:
    'Learn about Atlaris and how we help learners turn goals into scheduled execution.',
  openGraph: {
    title: 'About | Atlaris',
    description:
      'Learn about Atlaris and how we help learners turn goals into scheduled execution.',
    url: '/about',
    images: ['/og-default.jpg'],
  },
};

export default function Page(): React.ReactElement {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-linear-to-br from-primary/5 via-accent/5 to-background font-sans text-foreground">
      <HeroSection />
      <MissionSection />
      <ValuesSection />
      <TeamSection />
      <CtaSection />
    </div>
  );
}
