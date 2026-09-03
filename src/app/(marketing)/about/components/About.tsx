import { AboutHero } from './AboutHero';
import { BuilderSection } from './BuilderSection';
import { CloseSection } from './CloseSection';
import { ContactSection } from './ContactSection';
import { MethodSection } from './MethodSection';
import { SkySection } from './SkySection';
import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { StarField } from '@/app/(marketing)/_shared/StarField';
import { APP_SHELL_HEADER_TUCK } from '@/components/layout/app-shell-width';

import styles from './about.module.css';

/** After Hours about page composition. */
export function About() {
  return (
    <MarketingPageShell>
      <CelestialBackdrop />
      <div className='relative z-10'>
        <AboutHero />
        <Hairline />
        <BuilderSection />
        <SkySection />
        <MethodSection />
        <ContactSection />
        <CloseSection />
      </div>
    </MarketingPageShell>
  );
}

function CelestialBackdrop() {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden text-foreground ${APP_SHELL_HEADER_TUCK}`}
      aria-hidden='true'
    >
      <div
        className={`absolute -top-28 right-[8%] size-120 rounded-full bg-primary/15 blur-3xl md:size-152 ${styles.ambientOrb} ${styles.ambientOrbPrimary}`}
      />
      <div
        className={`absolute bottom-[-10%] -left-24 size-112 rounded-full bg-panel-muted/60 blur-3xl md:size-136 ${styles.ambientOrb} ${styles.ambientOrbMuted}`}
      />
      <StarField />
    </div>
  );
}

function Hairline() {
  return <div className='h-px w-full bg-border/35' aria-hidden='true' />;
}
