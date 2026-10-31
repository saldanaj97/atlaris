import { CtaSection } from './CtaSection';
import { FeaturesSection } from './FeaturesSection';
import { HeroSection } from './HeroSection';
import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { LandingPageShell } from '@/app/(landing)/_shared/LandingPageShell';

import styles from './landing.module.css';

/** Landing page composition for the public marketing route. */
export function Landing() {
  return (
    <LandingPageShell>
      <CelestialBackdrop
        variant='landing'
        primaryClassName={`${styles.ambientOrb} ${styles.ambientOrbPrimary}`}
        mutedClassName={`${styles.ambientOrb} ${styles.ambientOrbMuted}`}
      />
      {/* The page background, captured outside the dark-scoped hero for its bottom fade. */}
      <div className='relative z-10 [--landing-page-bg:var(--background)]'>
        <HeroSection />
        <FeaturesSection />
        <CtaSection />
      </div>
    </LandingPageShell>
  );
}
