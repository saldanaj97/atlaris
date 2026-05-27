import type { Metadata } from 'next';

import { LANDING_CANONICAL_TITLE, LANDING_DESCRIPTION } from './layout';
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

/**
 * Landing page for Atlaris - AI-powered learning roadmap and schedule generator.
 *
 * Design philosophy:
 * - Glassmorphism design with soft gradients and transparency
 * - AI-powered insights and crystal clarity
 * - Modern, airy, and intuitive interface
 *
 * This is a server component for optimal static generation.
 */
export default function LandingPage() {
  return (
    <div className='relative -mt-16 min-h-screen w-full overflow-hidden bg-linear-to-br from-primary/5 via-accent/5 to-background pt-16 font-sans text-foreground'>
      <div className='relative'>
        <HeroSection />
        <ProblemSolutionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <UseCasesSection />
        <FinalCtaSection />
      </div>
    </div>
  );
}
