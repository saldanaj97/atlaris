import type { Metadata } from 'next';

import {
  FeaturesSection,
  GradientBlobBackground,
  HowItWorksSection,
  ProblemSolutionSection,
  UseCasesSection,
} from './components';
import {
  FinalCtaSectionWithAnalytics,
  HeroSectionWithAnalytics,
} from './components/LandingAnalyticsWrapper';

export const metadata: Metadata = {
  title: 'Atlaris — Turn learning goals into a scheduled plan',
  description:
    'Atlaris turns what you want to learn into a time-blocked, resource-linked schedule that syncs to your calendar.',
};

/**
 * Landing page for Atlaris - AI-powered learning roadmap and schedule generator.
 *
 * Design philosophy:
 * - Glassmorphism design with soft gradients and transparency
 * - AI-powered insights and crystal clarity
 * - Modern, airy, and intuitive interface
 *
 * This is a server component for optimal static generation. Analytics tracking
 * is handled by client component wrappers (HeroSectionWithAnalytics and
 * FinalCtaSectionWithAnalytics).
 */
export default function LandingPage() {
  return (
    <div className="from-primary/5 via-accent/5 to-background text-foreground relative -mt-16 min-h-screen w-full overflow-hidden bg-linear-to-br pt-16 font-sans">
      <GradientBlobBackground />
      <div className="relative z-10">
        <HeroSectionWithAnalytics />
        <ProblemSolutionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <UseCasesSection />
        <FinalCtaSectionWithAnalytics />
      </div>
    </div>
  );
}
