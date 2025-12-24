'use client';

import {
  FeaturesSection,
  FinalCtaSection,
  HeroSection,
  HowItWorksSection,
  ProblemSolutionSection,
  UseCasesSection,
} from './components';
import { useLandingAnalytics } from './hooks/useLandingAnalytics';

/**
 * Landing page for Atlaris - AI-powered learning roadmap and schedule generator.
 *
 * Design philosophy:
 * - Glassmorphism design with soft gradients and transparency
 * - AI-powered insights and crystal clarity
 * - Modern, airy, and intuitive interface
 */
export default function LandingPage() {
  const { trackHeroCta, trackFooterCta } = useLandingAnalytics();

  return (
    <div className="mx-auto min-h-screen bg-gradient-to-br from-rose-100 via-purple-50 to-cyan-100 font-sans text-gray-800">
      <HeroSection onCtaClick={trackHeroCta} />
      <ProblemSolutionSection />
      <FeaturesSection />
      <HowItWorksSection />
      <UseCasesSection />
      <FinalCtaSection onCtaClick={trackFooterCta} />
    </div>
  );
}
