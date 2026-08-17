import { DriftSection } from './DriftSection';
import { HeroSection } from './HeroSection';
import { InstrumentsSection } from './InstrumentsSection';
import { PolarisSection } from './PolarisSection';
import { QuestionsSection } from './QuestionsSection';
import { RevealAnimation } from './RevealAnimation';
import { RouteSection } from './RouteSection';
import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { StarField } from '@/app/(marketing)/_shared/StarField';

import styles from './landing.module.css';

/** After Hours landing page composition. */
export function Landing() {
  return (
    <MarketingPageShell>
      <CelestialBackdrop />
      <div className='relative z-10'>
        <HeroSection />
        <Hairline />
        <DriftSection />
        <RouteSection />
        <InstrumentsSection />
        <QuestionsSection />
        <PolarisSection />
      </div>
    </MarketingPageShell>
  );
}

function CelestialBackdrop() {
  return (
    <div
      className='pointer-events-none absolute inset-0 overflow-hidden text-foreground'
      aria-hidden='true'
    >
      <div
        className={`absolute -top-24 -right-16 size-136 rounded-full bg-primary/20 blur-3xl md:size-168 ${styles.ambientOrb} ${styles.ambientOrbPrimary}`}
      />
      <div
        className={`absolute top-[30%] -left-28 size-112 rounded-full bg-panel-muted/70 blur-3xl md:size-144 ${styles.ambientOrb} ${styles.ambientOrbMuted}`}
      />
      <div
        className={`absolute right-[-6%] bottom-[12%] size-96 rounded-full bg-card/80 blur-3xl ${styles.ambientOrb} ${styles.ambientOrbCard}`}
      />
      <StarField />
    </div>
  );
}

function Hairline() {
  return (
    <RevealAnimation>
      <div
        className={`h-px w-full bg-border/35 ${styles.hairlineReveal}`}
        aria-hidden='true'
      />
    </RevealAnimation>
  );
}
