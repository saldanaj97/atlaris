/**
 * Analytics tracking utility for CTA clicks and other events.
 * Provides a simple abstraction that can be extended to integrate
 * with any analytics provider (Google Analytics, Mixpanel, etc.)
 */

interface TrackEventParams {
  event: string;
  label?: string;
  location?: string;
  [key: string]: unknown;
}

/**
 * Track an analytics event.
 * Supports Google Analytics (gtag) and Google Tag Manager (dataLayer).
 */
export function trackEvent(params: TrackEventParams): void {
  const { event, label, location, ...rest } = params;

  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Track with Google Analytics if available
    if ('gtag' in window) {
      (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag(
        'event',
        event,
        {
          event_category: 'engagement',
          event_label: label,
          cta_location: location,
          ...rest,
        }
      );
    }

    // Track with generic dataLayer push (GTM compatible)
    if ('dataLayer' in window) {
      (window as typeof window & { dataLayer: unknown[] }).dataLayer.push({
        event,
        ctaLocation: location,
        ctaLabel: label,
        ...rest,
      });
    }
  } catch (error) {
    // Silently handle analytics errors to not affect app flow
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[Analytics] Failed to track event:', error);
    }
  }
}
