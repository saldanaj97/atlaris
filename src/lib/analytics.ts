/**
 * Analytics tracking utility for CTA clicks and other events.
 * Provides a simple abstraction that can be extended to integrate
 * with any analytics provider (Google Analytics, Mixpanel, etc.)
 */

import { clientLogger } from '@/lib/logging/client';

type AnalyticsValue = string | number | boolean | null | undefined;

type AnalyticsEventParams = Record<string, AnalyticsValue>;

type GtagEventPayload = AnalyticsEventParams & {
  event_category: string;
  event_label?: string;
  cta_location?: string;
};

type DataLayerEvent = AnalyticsEventParams & {
  event: string;
  ctaLocation?: string;
  ctaLabel?: string;
};

type AnalyticsWindow = Window & {
  gtag?: (
    command: 'event',
    eventName: string,
    payload: GtagEventPayload,
  ) => void;
  dataLayer?: DataLayerEvent[];
};

interface TrackEventParams extends AnalyticsEventParams {
  event: string;
  label?: string;
  location?: string;
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
    const analyticsWindow = window as AnalyticsWindow;

    // Track with Google Analytics if available
    if (typeof analyticsWindow.gtag === 'function') {
      analyticsWindow.gtag('event', event, {
        event_category: 'engagement',
        event_label: label,
        cta_location: location,
        ...rest,
      });
    }

    // Track with generic dataLayer push (GTM compatible)
    if (Array.isArray(analyticsWindow.dataLayer)) {
      analyticsWindow.dataLayer.push({
        event,
        ctaLocation: location,
        ctaLabel: label,
        ...rest,
      });
    }
  } catch (error) {
    clientLogger.warn('analytics_track_failed', {
      err: error,
      event,
      label,
      location,
    });
  }
}
