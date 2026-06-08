import type { Metadata } from 'next';

import { LANDING_CANONICAL_TITLE, LANDING_DESCRIPTION } from './layout';
import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { FeaturesSection } from '@/app/(marketing)/landing/components/FeaturesSection';
import { FinalCtaSection } from '@/app/(marketing)/landing/components/FinalCtaSection';
import { HeroSection } from '@/app/(marketing)/landing/components/HeroSection';
import { HowItWorksSection } from '@/app/(marketing)/landing/components/HowItWorksSection';
import { ProblemSolutionSection } from '@/app/(marketing)/landing/components/ProblemSolutionSection';
import { UseCasesSection } from '@/app/(marketing)/landing/components/UseCasesSection';

export const metadata: Metadata = {
  title: LANDING_CANONICAL_TITLE,
  description: LANDING_DESCRIPTION,
};

export default function LandingPage() {
  return (
    <MarketingPageShell withHeaderOffset>
      <HeroSection />
      <ProblemSolutionSection />
      <FeaturesSection />
      <HowItWorksSection />
      <UseCasesSection />
      <FinalCtaSection />
    </MarketingPageShell>
  );
}
