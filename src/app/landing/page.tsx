'use client';

import { FinalCtaSection } from './components';
import { HeroSection } from './components/HeroSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { ProblemSolutionSection } from './components/ProblemSolutionSection';
import { UseCasesSection } from './components/UseCasesSection';
import { useLandingAnalytics } from './hooks/useLandingAnalytics';

/**
 * Landing page for Atlaris - AI-powered learning roadmap and schedule generator.
 *
 * Design philosophy:
 * - Anti-magic, high-end productivity tool aesthetic (Linear/Notion/Superhuman vibe)
 * - Off-white/cream background with charcoal text
 * - Deep slate blue as primary CTA color
 * - Subtle borders and soft shadows
 * - No sci-fi AI imagery; only UI mockups
 *
 * Accessibility:
 * - WCAG AA contrast ratios throughout
 * - Visible focus states for all interactive elements
 * - Proper heading hierarchy and semantic HTML
 * - ARIA labels where appropriate
 *
 * Performance:
 * - Minimal client-side JavaScript
 * - No heavy image assets (uses SVG and CSS)
 * - Components are code-split naturally
 */
export default function LandingPage() {
  const { trackHeroCta, trackFooterCta } = useLandingAnalytics();

  return (
    <div className="min-h-screen">
      <main>
        <HeroSection onCtaClick={trackHeroCta} />
        <ProblemSolutionSection />
        <HowItWorksSection />
        <UseCasesSection />
        <FinalCtaSection onCtaClick={trackFooterCta} />
      </main>
    </div>
  );
}
