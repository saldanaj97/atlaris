import {
  FeaturesSection,
  HowItWorksSection,
  ProblemSolutionSection,
  UseCasesSection,
} from './components';
import {
  FinalCtaSectionWithAnalytics,
  HeroSectionWithAnalytics,
} from './components/LandingAnalyticsWrapper';

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
    <div className="via-primary/10 mx-auto min-h-screen bg-gradient-to-br from-rose-100 to-cyan-100 font-sans text-gray-800">
      <HeroSectionWithAnalytics />
      <ProblemSolutionSection />
      <FeaturesSection />
      <HowItWorksSection />
      <UseCasesSection />
      <FinalCtaSectionWithAnalytics />
    </div>
  );
}
