import { DriftSection } from './DriftSection';
import { HeroSection } from './HeroSection';
import { InstrumentsSection } from './InstrumentsSection';
import { PolarisSection } from './PolarisSection';
import { RouteSection } from './RouteSection';
import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { Hairline } from '@/app/(landing)/_shared/Hairline';
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
      <div className='relative z-10'>
        <HeroSection />
        <Hairline />
        <DriftSection />
        <Hairline />
        <RouteSection />
        <Hairline />
        <InstrumentsSection />
        <Hairline />
        <PolarisSection />
      </div>
    </LandingPageShell>
  );
}
