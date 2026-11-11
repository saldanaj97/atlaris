import type { MarketingCreatePlanCta } from '@/features/navigation';

import { CtaSection } from './CtaSection';
import { HeroSection } from './HeroSection';
import { HowItWorksSection } from './HowItWorksSection';
import { PlanContentsSection } from './PlanContentsSection';
import { PricingSummarySection } from './PricingSummarySection';
import { ProblemSection } from './ProblemSection';
import { LandingPageShell } from '@/app/(landing)/_shared/LandingPageShell';
import { ibmPlexMono } from '@/app/fonts';

/**
 * Landing page composition for the public marketing route. Below the hero:
 * the problem, how it works, what a plan contains, what it costs, and the
 * closing banner. The sections borrow the hero's mono for labels and examples.
 */
export function Landing({
  createPlanCta,
}: {
  createPlanCta: MarketingCreatePlanCta;
}) {
  return (
    <LandingPageShell>
      <div className={`relative z-10 ${ibmPlexMono.variable}`}>
        <HeroSection createPlanCta={createPlanCta} />
        <ProblemSection />
        <HowItWorksSection />
        <PlanContentsSection createPlanCta={createPlanCta} />
        <PricingSummarySection />
        <CtaSection createPlanCta={createPlanCta} />
      </div>
    </LandingPageShell>
  );
}
