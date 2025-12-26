'use client';

/**
 * Simple analytics hook for tracking CTA clicks on the landing page.
 * This provides a basic analytics abstraction that can be extended
 * to integrate with any analytics provider (Google Analytics, Mixpanel, etc.)
 */

type CtaLocation = 'nav' | 'hero' | 'footer';

interface CtaClickEvent {
  location: CtaLocation;
  label: string;
  timestamp: number;
}

const BUILD_MY_SCHEDULE = 'Build My Schedule';
const GENERATE_SCHEDULE_NOW = 'Generate My Schedule Now';

/**
 * Hook for tracking CTA interactions on the landing page.
 * Returns a function to track CTA clicks with location context.
 */
export function useLandingAnalytics() {
  const trackCtaClick = (
    location: CtaLocation,
    label: string = BUILD_MY_SCHEDULE
  ) => {
    const event: CtaClickEvent = {
      location,
      label,
      timestamp: Date.now(),
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[Analytics] CTA Click:', event);
    }

    // Track with Google Analytics if available
    try {
      if (typeof window !== 'undefined' && 'gtag' in window) {
        (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag(
          'event',
          'cta_click',
          {
            event_category: 'engagement',
            event_label: label,
            cta_location: location,
          }
        );
      }
    } catch (error) {
      // Silently handle analytics errors to not affect app flow
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[Analytics] Failed to track with gtag:', error);
      }
    }

    // Track with generic dataLayer push (GTM compatible)
    try {
      if (typeof window !== 'undefined' && 'dataLayer' in window) {
        (window as typeof window & { dataLayer: unknown[] }).dataLayer.push({
          event: 'cta_click',
          ctaLocation: location,
          ctaLabel: label,
        });
      }
    } catch (error) {
      // Silently handle analytics errors to not affect app flow
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[Analytics] Failed to track with dataLayer:', error);
      }
    }

    // Could add additional analytics providers here:
    // - Mixpanel
    // - Amplitude
    // - PostHog
    // - Custom backend tracking
  };

  return {
    trackHeroCta: () => trackCtaClick('hero', BUILD_MY_SCHEDULE),
    trackFooterCta: () => trackCtaClick('footer', GENERATE_SCHEDULE_NOW),
  };
}
