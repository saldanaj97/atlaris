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

/**
 * Hook for tracking CTA interactions on the landing page.
 * Returns a function to track CTA clicks with location context.
 */
export function useLandingAnalytics() {
  const trackCtaClick = (
    location: CtaLocation,
    label: string = 'Build My Schedule'
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

    // Track with generic dataLayer push (GTM compatible)
    if (typeof window !== 'undefined' && 'dataLayer' in window) {
      (window as typeof window & { dataLayer: unknown[] }).dataLayer.push({
        event: 'cta_click',
        ctaLocation: location,
        ctaLabel: label,
      });
    }

    // Could add additional analytics providers here:
    // - Mixpanel
    // - Amplitude
    // - PostHog
    // - Custom backend tracking
  };

  return {
    trackNavCta: () => trackCtaClick('nav', 'Build My Schedule'),
    trackHeroCta: () => trackCtaClick('hero', 'Build My Schedule'),
    trackFooterCta: () => trackCtaClick('footer', 'Generate My Schedule Now'),
  };
}
