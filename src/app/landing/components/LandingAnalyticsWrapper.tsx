'use client';

import { useLandingAnalytics } from '../hooks/useLandingAnalytics';
import { FinalCtaSection } from './FinalCtaSection';
import { HeroSection } from './HeroSection';

/**
 * Client component wrapper for HeroSection with analytics tracking.
 * This allows the main landing page to remain a server component while still
 * tracking hero CTA interactions.
 */
export function HeroSectionWithAnalytics() {
  const { trackHeroCta } = useLandingAnalytics();
  return <HeroSection onCtaClick={trackHeroCta} />;
}

/**
 * Client component wrapper for FinalCtaSection with analytics tracking.
 * This allows the main landing page to remain a server component while still
 * tracking footer CTA interactions.
 */
export function FinalCtaSectionWithAnalytics() {
  const { trackFooterCta } = useLandingAnalytics();
  return <FinalCtaSection onCtaClick={trackFooterCta} />;
}
