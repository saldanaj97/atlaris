import { AboutHero } from './AboutHero';
import { BuilderSection } from './BuilderSection';
import { CloseSection } from './CloseSection';
import { ContactSection } from './ContactSection';
import { MethodSection } from './MethodSection';
import { SkySection } from './SkySection';
import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { Hairline } from '@/app/(landing)/_shared/Hairline';
import { LandingPageShell } from '@/app/(landing)/_shared/LandingPageShell';

import styles from './about.module.css';

/** About page composition. */
export function About() {
  return (
    <LandingPageShell>
      <CelestialBackdrop
        variant='dusk'
        primaryClassName={`${styles.ambientOrb} ${styles.ambientOrbPrimary}`}
        mutedClassName={`${styles.ambientOrb} ${styles.ambientOrbMuted}`}
      />
      <div className='relative z-10'>
        <AboutHero />
        <Hairline />
        <SkySection />
        <MethodSection />
        <BuilderSection />
        <ContactSection />
        <CloseSection />
      </div>
    </LandingPageShell>
  );
}
