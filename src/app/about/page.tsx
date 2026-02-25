import type { Metadata } from 'next';

import { GradientBlobBackground } from '@/app/landing/components';

import {
  HeroSection,
  MissionSection,
  ValuesSection,
  TeamSection,
  CtaSection,
} from './components';

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

export default function Page() {
  return (
    <div className="from-primary/5 via-accent/5 to-background text-foreground relative min-h-screen w-full overflow-hidden bg-linear-to-br font-sans">
      <GradientBlobBackground />
      <HeroSection />
      <MissionSection />
      <ValuesSection />
      <TeamSection />
      <CtaSection />
    </div>
  );
}
